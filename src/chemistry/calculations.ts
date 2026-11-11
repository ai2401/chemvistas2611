import {
  ChemicalElement,
  ELEMENTS,
  ELEMENT_BY_SYMBOL,
  ElementCategory,
} from './elements';
import { AtomNode, BondEdge, MoleculeModel } from './molecules';

export interface ElementCompositionItem {
  element: ChemicalElement;
  count: number;
  totalMass: number;
  massPercent: number;
}

export interface BondMeasurement {
  neighborAtomId: number;
  neighborElement: string;
  order: BondEdge['order'];
  lengthAngstrom: number;
}

export interface AngleMeasurement {
  atomAId: number;
  atomBId: number;
  label: string;
  angleDeg: number;
}

export interface AtomGeometryInspection {
  atom: AtomNode;
  element: ChemicalElement;
  coordinationNumber: number;
  bonds: BondMeasurement[];
  angles: AngleMeasurement[];
}

export interface NucleonPoint {
  type: 'proton' | 'neutron';
  x: number;
  y: number;
  z: number;
}

export interface ElectronPoint {
  shellIndex: number; // 0-based (K=0, L=1, ...)
  shellName: string;
  radius: number;
  angleRad: number;
  tiltX: number;
  tiltZ: number;
}

const SHELL_NAMES = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

/**
 * Computes molar mass (g/mol) and per-element mass composition for a molecule.
 */
export function analyzeMoleculeComposition(molecule: MoleculeModel): {
  molarMass: number;
  composition: ElementCompositionItem[];
} {
  const counts = new Map<string, number>();
  for (const atom of molecule.atoms) {
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1);
  }

  let totalMolarMass = 0;
  const rawItems: { element: ChemicalElement; count: number; totalMass: number }[] = [];

  for (const [symbol, count] of counts.entries()) {
    const el = ELEMENT_BY_SYMBOL[symbol];
    if (!el) {
      throw new Error(`Unknown element symbol: ${symbol}`);
    }
    const mass = el.atomicMass * count;
    totalMolarMass += mass;
    rawItems.push({ element: el, count, totalMass: mass });
  }

  // Sort: C first, H second (Hill system), then alphabetical
  rawItems.sort((a, b) => {
    const rank = (sym: string) => (sym === 'C' ? 0 : sym === 'H' ? 1 : 2);
    const ra = rank(a.element.symbol);
    const rb = rank(b.element.symbol);
    if (ra !== rb) return ra - rb;
    return a.element.symbol.localeCompare(b.element.symbol);
  });

  const composition: ElementCompositionItem[] = rawItems.map((item) => ({
    ...item,
    totalMass: Number(item.totalMass.toFixed(3)),
    massPercent:
      totalMolarMass > 0 ? Number(((item.totalMass / totalMolarMass) * 100).toFixed(2)) : 0,
  }));

  return {
    molarMass: Number(totalMolarMass.toFixed(3)),
    composition,
  };
}

/**
 * Computes Euclidean distance between two 3D atoms in Ångströms.
 */
export function computeBondLength(a: AtomNode, b: AtomNode): number {
  const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return Number(dist.toFixed(3));
}

/**
 * Computes bond angle A - Center - B in degrees.
 */
export function computeBondAngle(a: AtomNode, center: AtomNode, b: AtomNode): number {
  const v1x = a.x - center.x;
  const v1y = a.y - center.y;
  const v1z = a.z - center.z;
  const v2x = b.x - center.x;
  const v2y = b.y - center.y;
  const v2z = b.z - center.z;

  const len1 = Math.hypot(v1x, v1y, v1z);
  const len2 = Math.hypot(v2x, v2y, v2z);
  if (len1 === 0 || len2 === 0) return 0;

  const cosTheta = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / (len1 * len2)));
  return Number(((Math.acos(cosTheta) * 180) / Math.PI).toFixed(1));
}

/**
 * Inspects local coordination, bond lengths, and bond angles around a specific atom in a molecule.
 */
export function inspectAtomGeometry(
  molecule: MoleculeModel,
  atomId: number
): AtomGeometryInspection | null {
  const atomMap = new Map(molecule.atoms.map((a) => [a.id, a]));
  const atom = atomMap.get(atomId);
  if (!atom) return null;

  const element = ELEMENT_BY_SYMBOL[atom.element];
  if (!element) return null;

  const connectedBonds: BondMeasurement[] = [];
  const neighborNodes: AtomNode[] = [];

  for (const bond of molecule.bonds) {
    if (bond.from === atomId || bond.to === atomId) {
      const otherId = bond.from === atomId ? bond.to : bond.from;
      const otherAtom = atomMap.get(otherId);
      if (otherAtom) {
        neighborNodes.push(otherAtom);
        connectedBonds.push({
          neighborAtomId: otherId,
          neighborElement: otherAtom.element,
          order: bond.order,
          lengthAngstrom: computeBondLength(atom, otherAtom),
        });
      }
    }
  }

  const angles: AngleMeasurement[] = [];
  // Limit angle pairs to at most 8 so high-coordination crystal ions stay readable
  for (let i = 0; i < neighborNodes.length && angles.length < 8; i++) {
    for (let j = i + 1; j < neighborNodes.length && angles.length < 8; j++) {
      const na = neighborNodes[i];
      const nb = neighborNodes[j];
      angles.push({
        atomAId: na.id,
        atomBId: nb.id,
        label: `${na.element}${na.id + 1}–${atom.element}${atom.id + 1}–${nb.element}${nb.id + 1}`,
        angleDeg: computeBondAngle(na, atom, nb),
      });
    }
  }

  return {
    atom,
    element,
    coordinationNumber: connectedBonds.length,
    bonds: connectedBonds,
    angles,
  };
}

/**
 * Centers a molecule's coordinates around (0,0,0) and returns centered positions + bounding radius.
 */
export function computeCenteredCoordinates(atoms: AtomNode[]): {
  centroid: [number, number, number];
  centeredPositions: Map<number, [number, number, number]>;
  boundingRadius: number;
} {
  if (atoms.length === 0) {
    return { centroid: [0, 0, 0], centeredPositions: new Map(), boundingRadius: 1 };
  }

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const a of atoms) {
    sx += a.x;
    sy += a.y;
    sz += a.z;
  }
  const cx = sx / atoms.length;
  const cy = sy / atoms.length;
  const cz = sz / atoms.length;

  let maxR = 0.8;
  const centeredPositions = new Map<number, [number, number, number]>();
  for (const a of atoms) {
    const px = a.x - cx;
    const py = a.y - cy;
    const pz = a.z - cz;
    centeredPositions.set(a.id, [px, py, pz]);
    const r = Math.hypot(px, py, pz);
    if (r > maxR) maxR = r;
  }

  return {
    centroid: [cx, cy, cz],
    centeredPositions,
    boundingRadius: maxR,
  };
}

/**
 * Displaces an atom radially outward from the centroid according to an explode factor [0, 1].
 */
export function computeExplodedPosition(
  centeredPos: [number, number, number],
  explodeFactor: number
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, explodeFactor));
  const scale = 1 + clamped * 1.1;
  return [centeredPos[0] * scale, centeredPos[1] * scale, centeredPos[2] * scale];
}

/**
 * Filters elements by search query (symbol, Chinese name, English name, pinyin, or atomic number) and optional category.
 */
export function filterElements(
  query: string,
  category: ElementCategory | 'all',
  elements: ChemicalElement[] = ELEMENTS
): ChemicalElement[] {
  const trimmed = query.trim().toLowerCase();
  return elements.filter((el) => {
    if (category !== 'all' && el.category !== category) {
      return false;
    }
    if (!trimmed) return true;
    if (String(el.number) === trimmed) return true;
    if (el.symbol.toLowerCase().includes(trimmed)) return true;
    if (el.nameZh.includes(trimmed)) return true;
    if (el.nameEn.toLowerCase().includes(trimmed)) return true;
    if (el.pinyin.toLowerCase().includes(trimmed)) return true;
    return false;
  });
}

/**
 * Formats Kelvin temperature into Kelvin and Celsius string with uniform precision.
 */
export function formatKelvinWithCelsius(kelvin: number | null): string {
  if (kelvin === null) return '暂无实测数据';
  const celsius = kelvin - 273.15;
  return `${kelvin.toFixed(2).replace(/\.00$/, '')} K (${celsius >= 0 ? '+' : ''}${celsius.toFixed(1)} °C)`;
}

/**
 * Builds deterministic 3D nucleon cluster (protons + neutrons) and electron orbital points for 3D Bohr Atom view.
 */
export function build3DAtomStructure(element: ChemicalElement): {
  protons: number;
  neutrons: number;
  nucleons: NucleonPoint[];
  electrons: ElectronPoint[];
  shellRadii: { shellIndex: number; shellName: string; radius: number; count: number; tiltX: number; tiltZ: number }[];
} {
  const protons = element.number;
  const massNumber = Math.max(protons, Math.round(element.atomicMass));
  const neutrons = Math.max(0, massNumber - protons);
  const totalNucleons = protons + neutrons;

  // Cap visual nucleon spheres at 72 for ultra-heavy elements while preserving exact proton/neutron ratio
  const maxVisualNucleons = Math.min(totalNucleons, 72);
  const nucleons: NucleonPoint[] = [];

  if (maxVisualNucleons === 1) {
    nucleons.push({ type: 'proton', x: 0, y: 0, z: 0 });
  } else {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const clusterRadius = 0.22 * Math.cbrt(maxVisualNucleons);
    const visualProtons = Math.max(1, Math.round((protons / totalNucleons) * maxVisualNucleons));
    let pAdded = 0;
    let nAdded = 0;

    for (let i = 0; i < maxVisualNucleons; i++) {
      // Interleave protons and neutrons evenly
      const wantProton =
        pAdded < visualProtons &&
        (nAdded >= maxVisualNucleons - visualProtons ||
          pAdded / visualProtons <= nAdded / Math.max(1, maxVisualNucleons - visualProtons));
      const type: 'proton' | 'neutron' = wantProton ? 'proton' : 'neutron';
      if (wantProton) pAdded++;
      else nAdded++;

      // Layer concentric shells inside the nucleus
      const shellFrac = Math.cbrt((i + 0.5) / maxVisualNucleons);
      const yUnit = 1 - (2 * (i + 0.5)) / maxVisualNucleons;
      const radial = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
      const theta = goldenAngle * i * 3.7;
      const r = clusterRadius * (0.32 + 0.68 * shellFrac);

      nucleons.push({
        type,
        x: Number((Math.cos(theta) * radial * r).toFixed(4)),
        y: Number((yUnit * r).toFixed(4)),
        z: Number((Math.sin(theta) * radial * r).toFixed(4)),
      });
    }
  }

  const shellRadii: {
    shellIndex: number;
    shellName: string;
    radius: number;
    count: number;
    tiltX: number;
    tiltZ: number;
  }[] = [];
  const electrons: ElectronPoint[] = [];

  element.shells.forEach((count, sIdx) => {
    const shellName = SHELL_NAMES[sIdx] ?? `S${sIdx + 1}`;
    const radius = 1.35 + sIdx * 0.72;
    // Slight subtle artistic orbital plane tilt per shell while keeping concentric shell clarity
    const tiltX = ((sIdx % 3) - 1) * 0.22;
    const tiltZ = (((sIdx + 1) % 3) - 1) * 0.18;

    shellRadii.push({
      shellIndex: sIdx,
      shellName,
      radius,
      count,
      tiltX,
      tiltZ,
    });

    for (let eIdx = 0; eIdx < count; eIdx++) {
      const angleRad = (eIdx * 2 * Math.PI) / count + sIdx * 0.35;
      electrons.push({
        shellIndex: sIdx,
        shellName,
        radius,
        angleRad,
        tiltX,
        tiltZ,
      });
    }
  });

  return {
    protons,
    neutrons,
    nucleons,
    electrons,
    shellRadii,
  };
}

/**
 * Computes IUPAC 4-atom dihedral (torsion) angle A - B - C - D in degrees [-180.0, +180.0].
 */
export function computeDihedralAngle(
  a: AtomNode,
  b: AtomNode,
  c: AtomNode,
  d: AtomNode
): number {
  const b1x = b.x - a.x;
  const b1y = b.y - a.y;
  const b1z = b.z - a.z;

  const b2x = c.x - b.x;
  const b2y = c.y - b.y;
  const b2z = c.z - b.z;

  const b3x = d.x - c.x;
  const b3y = d.y - c.y;
  const b3z = d.z - c.z;

  const b2Len = Math.hypot(b2x, b2y, b2z);
  if (b2Len < 1e-6) return 0;
  const u2x = b2x / b2Len;
  const u2y = b2y / b2Len;
  const u2z = b2z / b2Len;

  // Normal n1 = b1 × u2
  const n1x = b1y * u2z - b1z * u2y;
  const n1y = b1z * u2x - b1x * u2z;
  const n1z = b1x * u2y - b1y * u2x;

  // Normal n2 = u2 × b3
  const n2x = u2y * b3z - u2z * b3y;
  const n2y = u2z * b3x - u2x * b3z;
  const n2z = u2x * b3y - u2y * b3x;

  const n1Len = Math.hypot(n1x, n1y, n1z);
  const n2Len = Math.hypot(n2x, n2y, n2z);
  if (n1Len < 1e-6 || n2Len < 1e-6) return 0;

  // m1 = n1 × u2
  const m1x = n1y * u2z - n1z * u2y;
  const m1y = n1z * u2x - n1x * u2z;
  const m1z = n1x * u2y - n1y * u2x;

  const x = n1x * n2x + n1y * n2y + n1z * n2z;
  const y = m1x * n2x + m1y * n2y + m1z * n2z;

  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return Number((Object.is(deg, -0) ? 0 : deg).toFixed(1));
}

export interface MultiAtomMeasurementResult {
  atoms: AtomNode[];
  distanceAB?: { label: string; angstrom: number };
  angleABC?: { label: string; degrees: number };
  dihedralABCD?: { label: string; degrees: number };
}

/**
 * Evaluates 2-atom distance, 3-atom angle, and 4-atom dihedral torsion angle for an ordered atom selection.
 */
export function measureAtomSelection(
  molecule: MoleculeModel,
  selectedIds: number[]
): MultiAtomMeasurementResult {
  const map = new Map(molecule.atoms.map((a) => [a.id, a]));
  const picked = selectedIds
    .map((id) => map.get(id))
    .filter((a): a is AtomNode => Boolean(a))
    .slice(0, 4);

  const result: MultiAtomMeasurementResult = { atoms: picked };

  if (picked.length >= 2) {
    const [a, b] = picked;
    result.distanceAB = {
      label: `${a.element}${a.id + 1} ··· ${b.element}${b.id + 1}`,
      angstrom: computeBondLength(a, b),
    };
  }
  if (picked.length >= 3) {
    const [a, b, c] = picked;
    result.angleABC = {
      label: `∠ ${a.element}${a.id + 1}–${b.element}${b.id + 1}–${c.element}${c.id + 1}`,
      degrees: computeBondAngle(a, b, c),
    };
  }
  if (picked.length >= 4) {
    const [a, b, c, d] = picked;
    result.dihedralABCD = {
      label: `φ ${a.element}${a.id + 1}–${b.element}${b.id + 1}–${c.element}${c.id + 1}–${d.element}${d.id + 1}`,
      degrees: computeDihedralAngle(a, b, c, d),
    };
  }

  return result;
}

export type SimulatedPhase = 'solid' | 'liquid' | 'gas' | 'unknown';

/**
 * Determines physical state of an element at 1 atm given temperature T (in Kelvin).
 */
export function getElementPhaseAtTemperature(
  el: ChemicalElement,
  kelvin: number
): SimulatedPhase {
  const T = Math.max(0, kelvin);

  if (el.meltingPoint === null && el.boilingPoint === null) {
    return 'unknown';
  }

  // Helium at 1 atm remains liquid down to near 0 K unless pressurized (>25 atm), vaporizes > 4.22 K
  if (el.number === 2) {
    if (el.boilingPoint !== null && T >= el.boilingPoint) return 'gas';
    return T < 0.95 ? 'solid' : 'liquid';
  }

  // Carbon sublimes at ~3823 K at 1 atm (meltingPoint ~3823, boilingPoint ~4098 in graphite arc data)
  if (el.boilingPoint !== null && T >= el.boilingPoint) {
    return 'gas';
  }
  if (el.meltingPoint !== null && T < el.meltingPoint) {
    return 'solid';
  }
  if (el.meltingPoint !== null && el.boilingPoint === null) {
    return T < el.meltingPoint ? 'solid' : 'liquid';
  }
  return 'liquid';
}

