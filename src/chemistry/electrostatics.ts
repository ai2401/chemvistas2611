import { ELEMENT_BY_SYMBOL } from './elements';
import { AtomNode, BondOrder, MoleculeModel } from './molecules';

export interface AtomElectrostaticInfo {
  atomId: number;
  element: string;
  partialCharge: number; // Elementary charge units (e)
  normalizedPotential: number; // Clamped [-1, +1] for ESP color mapping
  espColorHex: string;
}

export interface BondDipoleInfo {
  fromId: number;
  toId: number;
  positiveAtomId: number;
  negativeAtomId: number;
  magnitudeDebye: number;
}

export interface MoleculeElectrostatics {
  atoms: AtomElectrostaticInfo[];
  atomMap: Map<number, AtomElectrostaticInfo>;
  bondDipoles: BondDipoleInfo[];
  dipoleVector: [number, number, number]; // Points from δ+ toward δ- (chemistry convention)
  dipoleMagnitudeDebye: number;
  maxAbsCharge: number;
}

const BOND_ORDER_WEIGHT: Record<BondOrder, number> = {
  single: 1.0,
  aromatic: 1.15,
  double: 1.25,
  triple: 1.4,
  ionic: 1.65,
};

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Maps normalized charge potential [-1, +1] to standard chemistry ESP colors:
 * -1.0 (electron-rich δ⁻, negative potential) -> Red (#EF4444)
 *  0.0 (neutral / nonpolar)                   -> Soft Platinum White (#E2E8F0)
 * +1.0 (electron-poor δ⁺, positive potential) -> Royal Blue (#3B82F6)
 */
export function potentialToEspColorHex(normPotential: number): string {
  const clamped = Math.max(-1, Math.min(1, normPotential));
  // Neutral anchor: #E2E8F0 -> (226, 232, 240)
  const nr = 226;
  const ng = 232;
  const nb = 240;

  if (clamped < 0) {
    const t = Math.pow(-clamped, 0.82);
    // Negative δ⁻ target: #EF4444 -> (239, 68, 68)
    return rgbToHex(
      lerpChannel(nr, 239, t),
      lerpChannel(ng, 68, t),
      lerpChannel(nb, 68, t)
    );
  }
  const t = Math.pow(clamped, 0.82);
  // Positive δ⁺ target: #2563EB -> (37, 99, 235)
  return rgbToHex(
    lerpChannel(nr, 37, t),
    lerpChannel(ng, 99, t),
    lerpChannel(nb, 235, t)
  );
}

/**
 * Computes Pauling-electronegativity bond charge transfer, atomic partial charges (δ+/δ-),
 * Electrostatic Potential (ESP) colors, and 3D net molecular dipole moment vector (in Debye).
 */
export function computeMoleculeElectrostatics(
  molecule: MoleculeModel
): MoleculeElectrostatics {
  const charges = new Map<number, number>();
  const coordMap = new Map<number, AtomNode>();

  for (const atom of molecule.atoms) {
    charges.set(atom.id, 0);
    coordMap.set(atom.id, atom);
  }

  const bondDipoles: BondDipoleInfo[] = [];

  for (const bond of molecule.bonds) {
    const a = coordMap.get(bond.from);
    const b = coordMap.get(bond.to);
    if (!a || !b) continue;

    const chiA = ELEMENT_BY_SYMBOL[a.element]?.electronegativity ?? 2.2;
    const chiB = ELEMENT_BY_SYMBOL[b.element]?.electronegativity ?? 2.2;
    const diff = chiB - chiA; // > 0 means B is more electronegative (B becomes δ-, A becomes δ+)
    const weight = BOND_ORDER_WEIGHT[bond.order] ?? 1.0;

    // Calibrated Pauling bond charge transfer (yields ~1.85 D for H2O and 0.00 D for symmetric CO2/CH4/C6H6)
    const deltaQ = 0.265 * weight * diff;
    charges.set(a.id, (charges.get(a.id) ?? 0) + deltaQ);
    charges.set(b.id, (charges.get(b.id) ?? 0) - deltaQ);

    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const bondDebye = Math.abs(deltaQ) * len * 4.803;
    if (bondDebye > 0.08) {
      bondDipoles.push({
        fromId: a.id,
        toId: b.id,
        positiveAtomId: diff >= 0 ? a.id : b.id,
        negativeAtomId: diff >= 0 ? b.id : a.id,
        magnitudeDebye: Number(bondDebye.toFixed(2)),
      });
    }
  }

  // Compute centroid so dipole calculation is origin-independent even if net charge != 0
  let cx = 0;
  let cy = 0;
  let cz = 0;
  if (molecule.atoms.length > 0) {
    for (const a of molecule.atoms) {
      cx += a.x;
      cy += a.y;
      cz += a.z;
    }
    cx /= molecule.atoms.length;
    cy /= molecule.atoms.length;
    cz /= molecule.atoms.length;
  }

  // Chemistry convention vector: points from partial positive (δ+) toward partial negative (δ-)
  // Physics p = sum(q_i * r_i) points from - to +, so chemistry dipole arrow is -sum(q_i * r_i) * 4.803
  let mux = 0;
  let muy = 0;
  let muz = 0;
  let maxAbsCharge = 0;

  for (const a of molecule.atoms) {
    const q = charges.get(a.id) ?? 0;
    const absQ = Math.abs(q);
    if (absQ > maxAbsCharge) maxAbsCharge = absQ;

    mux += -q * (a.x - cx) * 4.803;
    muy += -q * (a.y - cy) * 4.803;
    muz += -q * (a.z - cz) * 4.803;
  }

  const dipoleMag = Math.hypot(mux, muy, muz);
  const scaleRef = Math.max(0.42, maxAbsCharge);

  const atoms: AtomElectrostaticInfo[] = [];
  const atomMap = new Map<number, AtomElectrostaticInfo>();

  for (const a of molecule.atoms) {
    const q = Number((charges.get(a.id) ?? 0).toFixed(3));
    const norm = Math.max(-1, Math.min(1, q / scaleRef));
    const info: AtomElectrostaticInfo = {
      atomId: a.id,
      element: a.element,
      partialCharge: q,
      normalizedPotential: Number(norm.toFixed(3)),
      espColorHex: potentialToEspColorHex(norm),
    };
    atoms.push(info);
    atomMap.set(a.id, info);
  }

  return {
    atoms,
    atomMap,
    bondDipoles,
    dipoleVector: [
      Number(mux.toFixed(4)),
      Number(muy.toFixed(4)),
      Number(muz.toFixed(4)),
    ],
    dipoleMagnitudeDebye: Number(dipoleMag.toFixed(2)),
    maxAbsCharge: Number(maxAbsCharge.toFixed(3)),
  };
}
