import { computeCenteredCoordinates } from './calculations';
import { BondOrder, MoleculeModel } from './molecules';
import { ReactionSimulationResult, ReactionSpeciesTerm } from './reactions';

export type PathwayBondRole = 'preserved' | 'broken' | 'formed';

export type PathwayPhaseKey =
  | 'reactants'
  | 'approach'
  | 'transition-state'
  | 'products'
  | 'elastic-collision';

export interface ConservedPathwayAtom {
  index: number;
  element: string;
  reactantClusterIndex: number;
  productClusterIndex: number;
  reactantLocalPos: [number, number, number];
  productLocalPos: [number, number, number];
  arcVector: [number, number, number];
  transfersFragment: boolean;
}

export interface PathwayClusterSpec {
  clusterIndex: number;
  side: 'reactant' | 'product';
  molecule: MoleculeModel;
  formulaText: string;
  nameZh: string;
  boundingRadius: number;
  separatedCenter: [number, number, number];
  collisionCenter: [number, number, number];
  atomIndices: number[];
}

export interface PathwayBondSpec {
  id: string;
  atomA: number;
  atomB: number;
  role: PathwayBondRole;
  fromOrder: BondOrder;
  toOrder: BondOrder;
}

export interface ReactionPathwayModel {
  simulationId: string;
  occurs: boolean;
  reversible: boolean;
  atoms: ConservedPathwayAtom[];
  bonds: PathwayBondSpec[];
  reactantClusters: PathwayClusterSpec[];
  productClusters: PathwayClusterSpec[];
  brokenBondCount: number;
  formedBondCount: number;
  preservedBondCount: number;
  sceneRadius: number;
}

export interface PathwayClusterLabelState {
  id: string;
  text: string;
  subtext: string;
  position: [number, number, number];
  opacity: number;
  tone: 'reactant' | 'transition' | 'product';
}

export interface PathwayBondFrameState {
  spec: PathwayBondSpec;
  opacity: number;
  activeOrder: BondOrder;
  stressFactor: number; // 0..1 visual highlight during bond breaking/forming
}

export interface PathwayPhaseDescriptor {
  phaseKey: PathwayPhaseKey;
  phaseTitle: string;
  phaseDetail: string;
  progressPercent: number;
}

export interface ReactionPathwayFrame {
  progress: number;
  atomPositions: [number, number, number][];
  bonds: PathwayBondFrameState[];
  labels: PathwayClusterLabelState[];
  tsIntensity: number; // 0..1 halo intensity around activated complex
  phase: PathwayPhaseDescriptor;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

interface ExpandedInstance {
  molecule: MoleculeModel;
  centeredPositions: Map<number, [number, number, number]>;
  boundingRadius: number;
}

function computeClusterPositions(
  instances: ExpandedInstance[],
  side: 'reactant' | 'product'
): {
  separated: [number, number, number][];
  collision: [number, number, number][];
} {
  const n = instances.length;
  if (n === 0) {
    return { separated: [], collision: [] };
  }
  if (n === 1) {
    return {
      separated: [[0, 0, 0]],
      collision: [[0, 0, 0]],
    };
  }

  if (n === 2) {
    const r0 = instances[0].boundingRadius;
    const r1 = instances[1].boundingRadius;
    const sep = Math.max(2.2, (r0 + r1) * 0.62 + 1.35);
    const coll = Math.max(0.88, (r0 + r1) * 0.28 + 0.48);
    return {
      separated: [
        [-sep, 0.08, 0],
        [sep, -0.08, 0],
      ],
      collision: [
        [-coll, 0.04, 0],
        [coll, -0.04, 0],
      ],
    };
  }

  // 3+ molecules: place largest/primary molecule near center-left/right or arrange in clean 3D ring
  const maxR = instances.reduce((m, inst) => Math.max(m, inst.boundingRadius), 0.8);
  const separated: [number, number, number][] = [];
  const collision: [number, number, number][] = [];

  if (n <= 6) {
    const ringRadius = Math.max(2.65, maxR * 1.08 + 1.15 + n * 0.22);
    const collRadius = Math.max(1.05, ringRadius * 0.4);
    const phaseShift = side === 'reactant' ? Math.PI : 0;

    for (let i = 0; i < n; i++) {
      const theta = phaseShift + (i * 2 * Math.PI) / n;
      const zOffset = n >= 4 ? (i % 2 === 0 ? 0.38 : -0.38) : 0;
      separated.push([
        Number((ringRadius * Math.cos(theta)).toFixed(4)),
        Number((ringRadius * 0.76 * Math.sin(theta)).toFixed(4)),
        zOffset,
      ]);
      collision.push([
        Number((collRadius * Math.cos(theta)).toFixed(4)),
        Number((collRadius * 0.72 * Math.sin(theta)).toFixed(4)),
        Number((zOffset * 0.45).toFixed(4)),
      ]);
    }
    return { separated, collision };
  }

  // Larger stoichiometric ensembles (e.g., complete combustion with many O2 / CO2 / H2O):
  // Golden-angle spherical shell around the primary molecule so nothing overlaps
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  separated.push([0, 0, 0]);
  collision.push([0, 0, 0]);

  const outerCount = n - 1;
  const shellR = Math.max(3.4, maxR + 1.8 + Math.sqrt(outerCount) * 0.55);
  const collShellR = Math.max(1.45, shellR * 0.42);

  for (let k = 0; k < outerCount; k++) {
    const yNorm = outerCount === 1 ? 0 : 1 - (k / (outerCount - 1)) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
    const phi = k * goldenAngle + (side === 'product' ? 0.8 : 0);
    const ux = Math.cos(phi) * radial;
    const uy = yNorm * 0.82;
    const uz = Math.sin(phi) * radial * 0.75;

    separated.push([
      Number((ux * shellR).toFixed(4)),
      Number((uy * shellR).toFixed(4)),
      Number((uz * shellR).toFixed(4)),
    ]);
    collision.push([
      Number((ux * collShellR).toFixed(4)),
      Number((uy * collShellR).toFixed(4)),
      Number((uz * collShellR).toFixed(4)),
    ]);
  }

  return { separated, collision };
}

interface FlattenedAtomEntry {
  flatIndex: number;
  clusterIndex: number;
  origAtomId: number;
  element: string;
  localPos: [number, number, number];
  collisionWorldPos: [number, number, number];
  neighborElements: string[];
  bondedFlatIndices: number[];
}

interface FlattenedSide {
  clusters: PathwayClusterSpec[];
  atoms: FlattenedAtomEntry[];
  bonds: { flatA: number; flatB: number; order: BondOrder }[];
}

function flattenSideSpecies(
  terms: ReactionSpeciesTerm[],
  side: 'reactant' | 'product'
): FlattenedSide {
  const instances: ExpandedInstance[] = [];
  for (const term of terms) {
    const centered = computeCenteredCoordinates(term.molecule.atoms);
    const copies = Math.max(1, Math.round(term.coefficient));
    for (let c = 0; c < copies; c++) {
      instances.push({
        molecule: term.molecule,
        centeredPositions: centered.centeredPositions,
        boundingRadius: centered.boundingRadius,
      });
    }
  }

  const { separated, collision } = computeClusterPositions(instances, side);

  const clusters: PathwayClusterSpec[] = [];
  const atoms: FlattenedAtomEntry[] = [];
  const bonds: { flatA: number; flatB: number; order: BondOrder }[] = [];

  instances.forEach((inst, clusterIdx) => {
    const sepCenter = separated[clusterIdx];
    const collCenter = collision[clusterIdx];
    const localIdToFlat = new Map<number, number>();
    const clusterAtomIndices: number[] = [];

    for (const atom of inst.molecule.atoms) {
      const localPos = inst.centeredPositions.get(atom.id) ?? [0, 0, 0];
      const flatIndex = atoms.length;
      localIdToFlat.set(atom.id, flatIndex);
      clusterAtomIndices.push(flatIndex);

      atoms.push({
        flatIndex,
        clusterIndex: clusterIdx,
        origAtomId: atom.id,
        element: atom.element,
        localPos,
        collisionWorldPos: [
          localPos[0] + collCenter[0],
          localPos[1] + collCenter[1],
          localPos[2] + collCenter[2],
        ],
        neighborElements: [],
        bondedFlatIndices: [],
      });
    }

    for (const bond of inst.molecule.bonds) {
      const fA = localIdToFlat.get(bond.from);
      const fB = localIdToFlat.get(bond.to);
      if (fA !== undefined && fB !== undefined && fA !== fB) {
        bonds.push({ flatA: fA, flatB: fB, order: bond.order });
        atoms[fA].neighborElements.push(atoms[fB].element);
        atoms[fB].neighborElements.push(atoms[fA].element);
        atoms[fA].bondedFlatIndices.push(fB);
        atoms[fB].bondedFlatIndices.push(fA);
      }
    }

    for (const fIdx of clusterAtomIndices) {
      atoms[fIdx].neighborElements.sort();
    }

    clusters.push({
      clusterIndex: clusterIdx,
      side,
      molecule: inst.molecule,
      formulaText: inst.molecule.formulaDisplay,
      nameZh: inst.molecule.nameZh,
      boundingRadius: inst.boundingRadius,
      separatedCenter: sepCenter,
      collisionCenter: collCenter,
      atomIndices: clusterAtomIndices,
    });
  });

  return { clusters, atoms, bonds };
}

function countSharedMultiset(a: string[], b: string[]): number {
  let i = 0;
  let j = 0;
  let shared = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      shared++;
      i++;
      j++;
    } else if (a[i] < b[j]) {
      i++;
    } else {
      j++;
    }
  }
  return shared;
}

function dist3(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function getReactionPhaseDescriptor(
  progress: number,
  occurs: boolean
): PathwayPhaseDescriptor {
  const p = clamp01(progress);
  const pct = Math.round(p * 100);

  if (!occurs) {
    if (p < 0.25) {
      return {
        phaseKey: 'reactants',
        phaseTitle: '初态：组分接近',
        phaseDetail: '分子依靠热运动相互靠近，保持各自共价键完整',
        progressPercent: pct,
      };
    }
    if (p <= 0.72) {
      return {
        phaseKey: 'elastic-collision',
        phaseTitle: '范德华接触 · 弹性碰撞反弹',
        phaseDetail: '常温碰撞动能不足以跨越共价断键活化能垒，电子云排斥后弹性分离',
        progressPercent: pct,
      };
    }
    return {
      phaseKey: 'products',
      phaseTitle: '终态：物理混合稳态',
      phaseDetail: '无旧键断裂或新键形成，分子维持原有化学结构',
      progressPercent: pct,
    };
  }

  if (p < 0.12) {
    return {
      phaseKey: 'reactants',
      phaseTitle: '初态：起始反应物',
      phaseDetail: '反应物分子处于独立平衡构型，准备沿有利取向碰撞',
      progressPercent: pct,
    };
  }
  if (p < 0.34) {
    return {
      phaseKey: 'approach',
      phaseTitle: '第一阶段：有效碰撞接近',
      phaseDetail: '反应物分子向反应中心靠拢，极性位点与前线轨道相互取向对准',
      progressPercent: pct,
    };
  }
  if (p <= 0.68) {
    return {
      phaseKey: 'transition-state',
      phaseTitle: '第二阶段：活化过渡态 [‡]',
      phaseDetail: '跨越活化能峰 Ea：旧共价键拉伸断裂（玫红渐隐），新共价键协同缔合（翠绿渐显）',
      progressPercent: pct,
    };
  }
  return {
    phaseKey: 'products',
    phaseTitle: '第三阶段：生成产物分离稳定',
    phaseDetail: '新化学键弛豫至平衡键长与键角，产物分子脱离反应区完成转化',
    progressPercent: pct,
  };
}

/**
 * Builds a deterministic, 1-to-1 atom-conserved 3D reaction pathway between reactants and products.
 */
export function buildReactionPathway(
  simulation: ReactionSimulationResult
): ReactionPathwayModel {
  const rSide = flattenSideSpecies(simulation.reactants, 'reactant');

  // For non-reactive pairs (occurs === false), keep exact identity mapping on rSide so molecules approach and rebound
  if (!simulation.occurs || !simulation.isAtomBalanced) {
    const atoms: ConservedPathwayAtom[] = rSide.atoms.map((ra, idx) => ({
      index: idx,
      element: ra.element,
      reactantClusterIndex: ra.clusterIndex,
      productClusterIndex: ra.clusterIndex,
      reactantLocalPos: ra.localPos,
      productLocalPos: ra.localPos,
      arcVector: [0, 0, 0],
      transfersFragment: false,
    }));

    const bonds: PathwayBondSpec[] = rSide.bonds.map((b, idx) => ({
      id: `bond-inert-${idx}`,
      atomA: b.flatA,
      atomB: b.flatB,
      role: 'preserved',
      fromOrder: b.order,
      toOrder: b.order,
    }));

    let maxExtent = 3.2;
    for (const c of rSide.clusters) {
      const d = Math.hypot(...c.separatedCenter) + c.boundingRadius;
      if (d > maxExtent) maxExtent = d;
    }

    return {
      simulationId: simulation.id,
      occurs: false,
      reversible: simulation.reversible,
      atoms,
      bonds,
      reactantClusters: rSide.clusters,
      productClusters: rSide.clusters.map((c) => ({ ...c, side: 'product' })),
      brokenBondCount: 0,
      formedBondCount: 0,
      preservedBondCount: bonds.length,
      sceneRadius: maxExtent,
    };
  }

  const pSide = flattenSideSpecies(simulation.products, 'product');

  // Map each rSide.atoms[rIdx] -> pSide.atoms[pIdx] of identical element
  const rToP = new Map<number, number>();
  const usedP = new Set<number>();

  // Group indices by element
  const elements = Array.from(new Set(rSide.atoms.map((a) => a.element)));
  const heavyElements = elements.filter((el) => el !== 'H');

  // Pass 1: Match heavy atoms by chemical neighborhood similarity + 3D collision proximity
  for (const el of heavyElements) {
    const rIndices = rSide.atoms
      .filter((a) => a.element === el)
      .map((a) => a.flatIndex);
    const pIndices = pSide.atoms
      .filter((a) => a.element === el)
      .map((a) => a.flatIndex);

    const candidatePairs: { rIdx: number; pIdx: number; cost: number }[] = [];
    for (const rIdx of rIndices) {
      const ra = rSide.atoms[rIdx];
      for (const pIdx of pIndices) {
        const pa = pSide.atoms[pIdx];
        const spatialDist = dist3(ra.collisionWorldPos, pa.collisionWorldPos);
        const sharedNeighbors = countSharedMultiset(
          ra.neighborElements,
          pa.neighborElements
        );
        const exactSigMatch =
          ra.neighborElements.length === pa.neighborElements.length &&
          sharedNeighbors === ra.neighborElements.length
            ? 3.0
            : 0;
        const cost = spatialDist - sharedNeighbors * 2.4 - exactSigMatch;
        candidatePairs.push({ rIdx, pIdx, cost });
      }
    }

    candidatePairs.sort((a, b) => a.cost - b.cost);
    for (const pair of candidatePairs) {
      if (!rToP.has(pair.rIdx) && !usedP.has(pair.pIdx)) {
        rToP.set(pair.rIdx, pair.pIdx);
        usedP.add(pair.pIdx);
      }
    }
  }

  // Pass 2: Match Hydrogen atoms, strongly preferring preserving X-H attachments to matched parent heavy atoms
  if (elements.includes('H')) {
    const rHIndices = rSide.atoms
      .filter((a) => a.element === 'H')
      .map((a) => a.flatIndex);
    const pHIndices = pSide.atoms
      .filter((a) => a.element === 'H')
      .map((a) => a.flatIndex);

    const hPairs: { rIdx: number; pIdx: number; cost: number }[] = [];
    for (const rIdx of rHIndices) {
      const ra = rSide.atoms[rIdx];
      const rParent = ra.bondedFlatIndices.find(
        (nb) => rSide.atoms[nb].element !== 'H'
      );
      const matchedPParent = rParent !== undefined ? rToP.get(rParent) : undefined;

      for (const pIdx of pHIndices) {
        const pa = pSide.atoms[pIdx];
        const pParent = pa.bondedFlatIndices.find(
          (nb) => pSide.atoms[nb].element !== 'H'
        );
        const preservesParentBond =
          matchedPParent !== undefined && matchedPParent === pParent;
        const spatialDist = dist3(ra.collisionWorldPos, pa.collisionWorldPos);
        const cost = spatialDist - (preservesParentBond ? 14.0 : 0);
        hPairs.push({ rIdx, pIdx, cost });
      }
    }

    hPairs.sort((a, b) => a.cost - b.cost);
    for (const pair of hPairs) {
      if (!rToP.has(pair.rIdx) && !usedP.has(pair.pIdx)) {
        rToP.set(pair.rIdx, pair.pIdx);
        usedP.add(pair.pIdx);
      }
    }
  }

  // Build reverse lookup pIdx -> conservedIdx (where conservedIdx === rIdx)
  const pToConserved = new Map<number, number>();
  const conservedAtoms: ConservedPathwayAtom[] = [];
  const productClusterAtomLists: number[][] = pSide.clusters.map(() => []);

  for (let rIdx = 0; rIdx < rSide.atoms.length; rIdx++) {
    const ra = rSide.atoms[rIdx];
    const pIdx = rToP.get(rIdx) ?? rIdx;
    const pa = pSide.atoms[pIdx] ?? ra;
    pToConserved.set(pIdx, rIdx);
    if (productClusterAtomLists[pa.clusterIndex]) {
      productClusterAtomLists[pa.clusterIndex].push(rIdx);
    }

    const travelVec: [number, number, number] = [
      pa.collisionWorldPos[0] - ra.collisionWorldPos[0],
      pa.collisionWorldPos[1] - ra.collisionWorldPos[1],
      pa.collisionWorldPos[2] - ra.collisionWorldPos[2],
    ];
    const travelDist = Math.hypot(...travelVec);
    const transfers = travelDist > 0.95;

    // Deterministic perpendicular arc so migrating atoms curve gracefully around the collision axis
    let arcVector: [number, number, number] = [0, 0, 0];
    if (transfers) {
      const sign = rIdx % 2 === 0 ? 1 : -1;
      const amp = Math.min(0.62, 0.22 + travelDist * 0.14);
      arcVector = [
        0,
        Number((sign * amp * 0.78).toFixed(4)),
        Number((-sign * amp * 0.62).toFixed(4)),
      ];
    }

    conservedAtoms.push({
      index: rIdx,
      element: ra.element,
      reactantClusterIndex: ra.clusterIndex,
      productClusterIndex: pa.clusterIndex,
      reactantLocalPos: ra.localPos,
      productLocalPos: pa.localPos,
      arcVector,
      transfersFragment: transfers,
    });
  }

  const updatedProductClusters: PathwayClusterSpec[] = pSide.clusters.map(
    (c, idx) => ({
      ...c,
      atomIndices: productClusterAtomLists[idx],
    })
  );

  // Classify every covalent/ionic bond into preserved, broken, or formed
  const rBondMap = new Map<string, { a: number; b: number; order: BondOrder }>();
  for (const rb of rSide.bonds) {
    rBondMap.set(pairKey(rb.flatA, rb.flatB), {
      a: rb.flatA,
      b: rb.flatB,
      order: rb.order,
    });
  }

  const pBondMap = new Map<string, { a: number; b: number; order: BondOrder }>();
  for (const pb of pSide.bonds) {
    const cA = pToConserved.get(pb.flatA);
    const cB = pToConserved.get(pb.flatB);
    if (cA !== undefined && cB !== undefined && cA !== cB) {
      pBondMap.set(pairKey(cA, cB), { a: cA, b: cB, order: pb.order });
    }
  }

  const pathwayBonds: PathwayBondSpec[] = [];
  let brokenBondCount = 0;
  let formedBondCount = 0;
  let preservedBondCount = 0;

  for (const [key, rb] of rBondMap.entries()) {
    const pb = pBondMap.get(key);
    if (pb) {
      preservedBondCount++;
      pathwayBonds.push({
        id: `bond-preserved-${key}`,
        atomA: rb.a,
        atomB: rb.b,
        role: 'preserved',
        fromOrder: rb.order,
        toOrder: pb.order,
      });
    } else {
      brokenBondCount++;
      pathwayBonds.push({
        id: `bond-broken-${key}`,
        atomA: rb.a,
        atomB: rb.b,
        role: 'broken',
        fromOrder: rb.order,
        toOrder: rb.order,
      });
    }
  }

  for (const [key, pb] of pBondMap.entries()) {
    if (!rBondMap.has(key)) {
      formedBondCount++;
      pathwayBonds.push({
        id: `bond-formed-${key}`,
        atomA: pb.a,
        atomB: pb.b,
        role: 'formed',
        fromOrder: pb.order,
        toOrder: pb.order,
      });
    }
  }

  // Mark reaction-center atoms strictly as those participating in broken or formed bonds
  const reactionCenterAtoms = new Set<number>();
  for (const b of pathwayBonds) {
    if (b.role === 'broken' || b.role === 'formed') {
      reactionCenterAtoms.add(b.atomA);
      reactionCenterAtoms.add(b.atomB);
    }
  }
  for (const atom of conservedAtoms) {
    atom.transfersFragment = reactionCenterAtoms.has(atom.index);
  }

  let maxExtent = 3.2;
  for (const c of [...rSide.clusters, ...updatedProductClusters]) {
    const d = Math.hypot(...c.separatedCenter) + c.boundingRadius;
    if (d > maxExtent) maxExtent = d;
  }

  return {
    simulationId: simulation.id,
    occurs: true,
    reversible: simulation.reversible,
    atoms: conservedAtoms,
    bonds: pathwayBonds,
    reactantClusters: rSide.clusters,
    productClusters: updatedProductClusters,
    brokenBondCount,
    formedBondCount,
    preservedBondCount,
    sceneRadius: maxExtent,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Evaluates 3D atom coordinates, bond opacities/orders, and floating species labels at progress in [0, 1].
 */
export function evaluateReactionPathwayFrame(
  pathway: ReactionPathwayModel,
  rawProgress: number
): ReactionPathwayFrame {
  const p = clamp01(rawProgress);
  const phase = getReactionPhaseDescriptor(p, pathway.occurs);

  if (!pathway.occurs) {
    // Approach smoothly until p=0.48, slight steric shimmer at p=0.5, rebound smoothly to p=1.0
    const approach =
      p <= 0.5 ? smoothstep(0.04, 0.48, p) : 1 - smoothstep(0.52, 0.96, p);
    const tsIntensity = Math.exp(-Math.pow((p - 0.5) / 0.11, 2)) * 0.65;

    const clusterCenters = pathway.reactantClusters.map((c) =>
      lerpVec3(c.separatedCenter, c.collisionCenter, approach * 0.85)
    );

    const atomPositions: [number, number, number][] = pathway.atoms.map((atom) => {
      const center = clusterCenters[atom.reactantClusterIndex] ?? [0, 0, 0];
      return [
        center[0] + atom.reactantLocalPos[0],
        center[1] + atom.reactantLocalPos[1],
        center[2] + atom.reactantLocalPos[2],
      ];
    });

    const bonds: PathwayBondFrameState[] = pathway.bonds.map((spec) => ({
      spec,
      opacity: 1,
      activeOrder: spec.fromOrder,
      stressFactor: 0,
    }));

    const labels: PathwayClusterLabelState[] =
      pathway.reactantClusters.length <= 8
        ? pathway.reactantClusters.map((c, idx) => {
            const center = clusterCenters[idx];
            return {
              id: `lbl-inert-${idx}`,
              text: c.formulaText,
              subtext: c.nameZh,
              position: [
                center[0],
                center[1] + c.boundingRadius + 0.72,
                center[2],
              ],
              opacity: 0.92,
              tone: 'reactant',
            };
          })
        : [];

    if (tsIntensity > 0.25) {
      labels.push({
        id: 'lbl-elastic-bounce',
        text: '范德华弹性碰撞',
        subtext: '未达断键活化能',
        position: [0, 1.95, 0],
        opacity: Math.min(1, tsIntensity * 1.4),
        tone: 'transition',
      });
    }

    return {
      progress: p,
      atomPositions,
      bonds,
      labels,
      tsIntensity,
      phase,
    };
  }

  // Reactive trajectory:
  // 1. Approach: [0.00 -> 0.34] moves reactant clusters from separatedCenter -> collisionCenter
  // 2. Rearrangement: [0.28 -> 0.72] morphs atoms across transition state [‡] at p = 0.50
  // 3. Separation: [0.66 -> 1.00] separates formed product clusters from collisionCenter -> separatedCenter
  const alphaIn = smoothstep(0.02, 0.34, p);
  const beta = smoothstep(0.28, 0.72, p);
  const alphaOut = smoothstep(0.66, 0.98, p);
  const arcPulse = Math.sin(Math.PI * beta);
  const tsIntensity = Math.exp(-Math.pow((p - 0.5) / 0.13, 2));

  const rCenters = pathway.reactantClusters.map((c) =>
    lerpVec3(c.separatedCenter, c.collisionCenter, alphaIn)
  );
  const pCenters = pathway.productClusters.map((c) =>
    lerpVec3(c.collisionCenter, c.separatedCenter, alphaOut)
  );

  const atomPositions: [number, number, number][] = pathway.atoms.map((atom) => {
    const rC = rCenters[atom.reactantClusterIndex] ?? [0, 0, 0];
    const pC = pCenters[atom.productClusterIndex] ?? [0, 0, 0];

    const rWorld: [number, number, number] = [
      rC[0] + atom.reactantLocalPos[0],
      rC[1] + atom.reactantLocalPos[1],
      rC[2] + atom.reactantLocalPos[2],
    ];
    const pWorld: [number, number, number] = [
      pC[0] + atom.productLocalPos[0],
      pC[1] + atom.productLocalPos[1],
      pC[2] + atom.productLocalPos[2],
    ];

    return [
      lerp(rWorld[0], pWorld[0], beta) + atom.arcVector[0] * arcPulse,
      lerp(rWorld[1], pWorld[1], beta) + atom.arcVector[1] * arcPulse,
      lerp(rWorld[2], pWorld[2], beta) + atom.arcVector[2] * arcPulse,
    ];
  });

  // Concerted Transition-State bond fade & stress timing:
  // Both cleaving old bonds (rose) and nucleating new bonds (emerald) remain clearly visible as partial bonds across p = 0.50 [‡]
  const brokenOpacity = 1 - smoothstep(0.3, 0.68, p);
  const brokenStress = smoothstep(0.2, 0.5, p);

  const formedOpacity = smoothstep(0.32, 0.7, p);
  const formedStress = 1 - smoothstep(0.65, 0.92, p);

  const bonds: PathwayBondFrameState[] = pathway.bonds.map((spec) => {
    if (spec.role === 'preserved') {
      return {
        spec,
        opacity: 1,
        activeOrder: p < 0.5 ? spec.fromOrder : spec.toOrder,
        stressFactor:
          spec.fromOrder !== spec.toOrder ? tsIntensity * 0.75 : 0,
      };
    }
    if (spec.role === 'broken') {
      return {
        spec,
        opacity: brokenOpacity,
        activeOrder: spec.fromOrder,
        stressFactor: brokenStress,
      };
    }
    return {
      spec,
      opacity: formedOpacity,
      activeOrder: spec.toOrder,
      stressFactor: formedStress,
    };
  });

  // Floating 3D cluster labels (capped to <= 8 clusters so large combustion stays clean)
  const labels: PathwayClusterLabelState[] = [];
  const rLabelAlpha = 1 - smoothstep(0.26, 0.42, p);
  const pLabelAlpha = smoothstep(0.58, 0.76, p);

  if (rLabelAlpha > 0.04 && pathway.reactantClusters.length <= 8) {
    pathway.reactantClusters.forEach((c, idx) => {
      const center = rCenters[idx];
      labels.push({
        id: `lbl-r-${idx}`,
        text: c.formulaText,
        subtext: c.nameZh,
        position: [center[0], center[1] + c.boundingRadius + 0.72, center[2]],
        opacity: rLabelAlpha,
        tone: 'reactant',
      });
    });
  }

  if (tsIntensity > 0.22) {
    labels.push({
      id: 'lbl-ts-complex',
      text: '[活化络合物过渡态]‡',
      subtext: `断 ${pathway.brokenBondCount} 键 · 成 ${pathway.formedBondCount} 键`,
      position: [0, 2.05, 0],
      opacity: Math.min(1, tsIntensity * 1.35),
      tone: 'transition',
    });
  }

  if (pLabelAlpha > 0.04 && pathway.productClusters.length <= 8) {
    pathway.productClusters.forEach((c, idx) => {
      const center = pCenters[idx];
      labels.push({
        id: `lbl-p-${idx}`,
        text: c.formulaText,
        subtext: c.nameZh,
        position: [center[0], center[1] + c.boundingRadius + 0.72, center[2]],
        opacity: pLabelAlpha,
        tone: 'product',
      });
    });
  }

  return {
    progress: p,
    atomPositions,
    bonds,
    labels,
    tsIntensity,
    phase,
  };
}
