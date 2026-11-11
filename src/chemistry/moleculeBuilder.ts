import { ELEMENT_BY_SYMBOL } from './elements';
import { AtomNode, BondEdge, BondOrder, MoleculeModel } from './molecules';
import { formatMolecularFormula } from './structureParser';

const TYPICAL_VALENCE: Record<string, number> = {
  H: 1,
  B: 3,
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Si: 4,
  P: 3,
  S: 2,
  Cl: 1,
  Br: 1,
  I: 1,
};

function bondOrderValenceCount(order: BondOrder): number {
  if (order === 'double') return 2;
  if (order === 'triple') return 3;
  if (order === 'aromatic') return 1.5;
  return 1;
}

function normalizeVec(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return [1, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dotVec(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function rotateAroundAxis(
  v: [number, number, number],
  axis: [number, number, number],
  angleRad: number
): [number, number, number] {
  const k = normalizeVec(axis);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const kCrossV = crossVec(k, v);
  const kDotV = dotVec(k, v);
  return [
    v[0] * cosA + kCrossV[0] * sinA + k[0] * kDotV * (1 - cosA),
    v[1] * cosA + kCrossV[1] * sinA + k[1] * kDotV * (1 - cosA),
    v[2] * cosA + kCrossV[2] * sinA + k[2] * kDotV * (1 - cosA),
  ];
}

/**
 * Computes an ideal VSEPR 3D unit direction vector for attaching a new substituent onto `targetAtom`.
 */
export function computeIdealBondDirection(
  molecule: MoleculeModel,
  targetAtomId: number,
  newBondOrder: BondOrder
): [number, number, number] {
  const atomMap = new Map(molecule.atoms.map((a) => [a.id, a]));
  const center = atomMap.get(targetAtomId);
  if (!center) return [1, 0, 0];

  const neighborDirs: [number, number, number][] = [];
  let existingBondOrderSum = 0;

  for (const b of molecule.bonds) {
    if (b.from === targetAtomId || b.to === targetAtomId) {
      existingBondOrderSum += bondOrderValenceCount(b.order);
      const otherId = b.from === targetAtomId ? b.to : b.from;
      const other = atomMap.get(otherId);
      if (other) {
        neighborDirs.push(
          normalizeVec([other.x - center.x, other.y - center.y, other.z - center.z])
        );
      }
    }
  }

  const n = neighborDirs.length;
  if (n === 0) {
    return [1, 0, 0];
  }

  if (n === 1) {
    const u1 = neighborDirs[0];
    // Choose ideal angle based on hybridization implied by bond orders & element
    const totalOrder = existingBondOrderSum + bondOrderValenceCount(newBondOrder);
    let idealDeg = 109.47; // sp3 default
    if (newBondOrder === 'triple' || existingBondOrderSum >= 3 || totalOrder >= 4 && newBondOrder === 'double') {
      idealDeg = 180.0; // sp linear (e.g. O=C=O, H-C≡C)
    } else if (newBondOrder === 'double' || existingBondOrderSum >= 2 || center.element === 'B') {
      idealDeg = 120.0; // sp2 trigonal planar
    } else if (center.element === 'O' || center.element === 'S') {
      idealDeg = 104.5; // bent lone-pair compression
    }

    if (idealDeg >= 179.5) {
      return [-u1[0], -u1[1], -u1[2]];
    }

    const ref: [number, number, number] =
      Math.abs(u1[1]) < 0.85 ? [0, 1, 0] : [0, 0, 1];
    const perp = normalizeVec(crossVec(u1, ref));
    const rotRad = (idealDeg * Math.PI) / 180;
    return normalizeVec(rotateAroundAxis(u1, perp, rotRad));
  }

  if (n === 2) {
    const u1 = neighborDirs[0];
    const u2 = neighborDirs[1];
    const sum: [number, number, number] = [u1[0] + u2[0], u1[1] + u2[1], u1[2] + u2[2]];
    const sumLen = Math.hypot(sum[0], sum[1], sum[2]);

    // If sp2 planar (has a double bond or Boron), place in-plane opposite bisector (120°)
    if (existingBondOrderSum > 2.1 || newBondOrder === 'double' || center.element === 'B') {
      if (sumLen > 1e-4) {
        return normalizeVec([-sum[0], -sum[1], -sum[2]]);
      }
      const ref: [number, number, number] = Math.abs(u1[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
      return normalizeVec(crossVec(u1, ref));
    }

    // Tetrahedral sp3 3rd substituent: tilt out of the u1-u2 plane!
    const normal = normalizeVec(crossVec(u1, u2));
    if (sumLen < 1e-4) {
      return normal;
    }
    const oppBisector = normalizeVec([-sum[0], -sum[1], -sum[2]]);
    // For ideal tetrahedron, 3rd vertex lies in plane of oppBisector and ±normal at cos(54.735°) & sin(54.735°)
    const c = Math.cos((54.735 * Math.PI) / 180);
    const s = Math.sin((54.735 * Math.PI) / 180);
    return normalizeVec([
      oppBisector[0] * c + normal[0] * s,
      oppBisector[1] * c + normal[1] * s,
      oppBisector[2] * c + normal[2] * s,
    ]);
  }

  if (n === 3) {
    // 4th substituent points opposite the sum of the existing 3 neighbor vectors
    const sx = neighborDirs[0][0] + neighborDirs[1][0] + neighborDirs[2][0];
    const sy = neighborDirs[0][1] + neighborDirs[1][1] + neighborDirs[2][1];
    const sz = neighborDirs[0][2] + neighborDirs[1][2] + neighborDirs[2][2];
    if (Math.hypot(sx, sy, sz) > 1e-3) {
      return normalizeVec([-sx, -sy, -sz]);
    }
    // If existing 3 are coplanar (trigonal planar), point along plane normal
    return normalizeVec(crossVec(neighborDirs[0], neighborDirs[1]));
  }

  // General fallback for hypervalent 5+ coordination: sample Fibonacci sphere and maximize minimum angle + steric clearance
  let bestDir: [number, number, number] = [0, 1, 0];
  let bestMinDot = 2; // smaller max-dot = larger minimum angle from all neighbors
  const samples = 64;
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < samples; i++) {
    const y = 1 - (2 * (i + 0.5)) / samples;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const cand: [number, number, number] = [Math.cos(theta) * r, y, Math.sin(theta) * r];

    let maxDot = -2;
    for (const nd of neighborDirs) {
      const d = dotVec(cand, nd);
      if (d > maxDot) maxDot = d;
    }
    if (maxDot < bestMinDot) {
      bestMinDot = maxDot;
      bestDir = cand;
    }
  }
  return bestDir;
}

function finalizeEditedMolecule(
  base: MoleculeModel,
  atoms: AtomNode[],
  bonds: BondEdge[],
  customTitle?: string
): MoleculeModel {
  // Re-index atom IDs cleanly 0..N-1 so all UI badges & bond indices stay contiguous
  const idMap = new Map<number, number>();
  const cleanAtoms: AtomNode[] = atoms.map((a, idx) => {
    idMap.set(a.id, idx);
    return { ...a, id: idx };
  });

  const seenPairs = new Set<string>();
  const cleanBonds: BondEdge[] = [];
  for (const b of bonds) {
    const f = idMap.get(b.from);
    const t = idMap.get(b.to);
    if (f === undefined || t === undefined || f === t) continue;
    const key = f < t ? `${f}-${t}` : `${t}-${f}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    cleanBonds.push({ from: f, to: t, order: b.order });
  }

  const formula = formatMolecularFormula(cleanAtoms);
  const isAlreadyCustom = base.id.startsWith('builder-');

  return {
    id: isAlreadyCustom ? base.id : `builder-${Date.now()}`,
    nameZh: customTitle ?? (isAlreadyCustom ? `自建分子 (${formula})` : `${base.nameZh} · 编辑态`),
    nameEn: `Custom Built (${formula})`,
    formulaDisplay: formula,
    category: 'organic',
    geometry: `自由搭建三维构型 (${cleanAtoms.length} 原子 / ${cleanBonds.length} 键)`,
    symmetry: '自定义三维分子构象',
    hybridization: 'VSEPR 价层电子对互斥几何排布',
    dipoleMoment: '由电负性实时推演',
    bondAngleSummary: '点击原子或使用自由测距尺实测',
    description: '通过三维分子搭建器实时构建或改写的自定义化学结构，所有键长按 IUPAC 共价半径与键级自动排布。',
    atoms: cleanAtoms,
    bonds: cleanBonds,
    aromaticRings: undefined,
  };
}

/**
 * Adds a new atom bonded to `targetAtomId` using ideal covalent bond length and VSEPR geometry.
 */
export function addBondedAtomWithVsepr(
  molecule: MoleculeModel,
  targetAtomId: number,
  newElement: string,
  bondOrder: BondOrder = 'single'
): { molecule: MoleculeModel; addedAtomId: number } {
  const target = molecule.atoms.find((a) => a.id === targetAtomId) ?? molecule.atoms[0];
  if (!target) {
    const fresh = createSeedMolecule(newElement);
    return { molecule: fresh, addedAtomId: 0 };
  }

  const elA = ELEMENT_BY_SYMBOL[target.element];
  const elB = ELEMENT_BY_SYMBOL[newElement];
  const rA = (elA?.covalentRadius ?? 76) / 100;
  const rB = (elB?.covalentRadius ?? 76) / 100;
  const orderShrink =
    bondOrder === 'triple' ? 0.79 : bondOrder === 'double' ? 0.88 : 1.0;
  const bondLen = Math.max(0.95, (rA + rB) * orderShrink);

  const dir = computeIdealBondDirection(molecule, target.id, bondOrder);
  const tempNewId = Math.max(0, ...molecule.atoms.map((a) => a.id)) + 1;

  const newAtom: AtomNode = {
    id: tempNewId,
    element: newElement,
    x: Number((target.x + dir[0] * bondLen).toFixed(4)),
    y: Number((target.y + dir[1] * bondLen).toFixed(4)),
    z: Number((target.z + dir[2] * bondLen).toFixed(4)),
  };

  const nextMol = finalizeEditedMolecule(
    molecule,
    [...molecule.atoms, newAtom],
    [...molecule.bonds, { from: target.id, to: tempNewId, order: bondOrder }]
  );

  return {
    molecule: nextMol,
    addedAtomId: nextMol.atoms.length - 1,
  };
}

/**
 * Connects two existing atoms or updates/cycles the bond order between them.
 */
export function connectOrUpdateBond(
  molecule: MoleculeModel,
  atomAId: number,
  atomBId: number,
  desiredOrder: BondOrder
): MoleculeModel {
  if (atomAId === atomBId) return molecule;
  let found = false;
  const nextBonds = molecule.bonds.map((b) => {
    if (
      (b.from === atomAId && b.to === atomBId) ||
      (b.from === atomBId && b.to === atomAId)
    ) {
      found = true;
      // If clicking with same order, cycle single -> double -> triple -> single
      const nextOrder: BondOrder =
        b.order === desiredOrder
          ? b.order === 'single'
            ? 'double'
            : b.order === 'double'
              ? 'triple'
              : 'single'
          : desiredOrder;
      return { ...b, order: nextOrder };
    }
    return b;
  });

  if (!found) {
    nextBonds.push({ from: atomAId, to: atomBId, order: desiredOrder });
  }

  return finalizeEditedMolecule(molecule, molecule.atoms, nextBonds);
}

/**
 * Removes an atom and its incident bonds (retaining at least 1 atom in the scene).
 */
export function removeAtomFromMolecule(
  molecule: MoleculeModel,
  atomId: number
): MoleculeModel {
  if (molecule.atoms.length <= 1) return molecule;
  const remainingAtoms = molecule.atoms.filter((a) => a.id !== atomId);
  const remainingBonds = molecule.bonds.filter(
    (b) => b.from !== atomId && b.to !== atomId
  );
  return finalizeEditedMolecule(molecule, remainingAtoms, remainingBonds);
}

/**
 * Automatically sprouts Hydrogen atoms onto all atoms with unfilled standard covalent valence.
 */
export function saturateWithHydrogens(molecule: MoleculeModel): MoleculeModel {
  let working = molecule;
  // Snapshot initial heavy/existing atom count so newly added H atoms aren't re-scanned
  const initialCount = working.atoms.length;

  for (let idx = 0; idx < initialCount; idx++) {
    const atom = working.atoms[idx];
    if (!atom || atom.element === 'H') continue;
    const maxValence = TYPICAL_VALENCE[atom.element];
    if (!maxValence) continue;

    let usedValence = 0;
    for (const b of working.bonds) {
      if (b.from === atom.id || b.to === atom.id) {
        usedValence += bondOrderValenceCount(b.order);
      }
    }

    const neededH = Math.max(0, Math.floor(maxValence - usedValence + 0.01));
    for (let k = 0; k < neededH && working.atoms.length < 180; k++) {
      working = addBondedAtomWithVsepr(working, atom.id, 'H', 'single').molecule;
    }
  }

  return working;
}

/**
 * Creates a fresh single-atom seed molecule at the origin for free 3D building.
 */
export function createSeedMolecule(seedElement = 'C'): MoleculeModel {
  const sym = ELEMENT_BY_SYMBOL[seedElement] ? seedElement : 'C';
  return {
    id: `builder-${Date.now()}`,
    nameZh: `自建分子 (${sym})`,
    nameEn: `Custom Seed (${sym})`,
    formulaDisplay: sym,
    category: 'organic',
    geometry: '单原子起点 (点击原子接枝成键或一键加氢)',
    symmetry: 'K_h 球对称',
    hybridization: '待成键杂化',
    dipoleMoment: '0.00 D',
    bondAngleSummary: '在搭建模式下点击该原子即可生长三维分子',
    description: '新建空白分子画布起点：选择元素与键级后点击场景中的原子即可按 VSEPR 理想键角向外生长。',
    atoms: [{ id: 0, element: sym, x: 0, y: 0, z: 0 }],
    bonds: [],
  };
}
