export type BondOrder = 'single' | 'double' | 'triple' | 'aromatic' | 'ionic';

export type MoleculeCategory = 'inorganic' | 'organic' | 'biomed' | 'crystal';

export interface AtomNode {
  id: number;
  element: string;
  x: number; // Å
  y: number; // Å
  z: number; // Å
  label?: string;
}

export interface BondEdge {
  from: number;
  to: number;
  order: BondOrder;
}

export interface AromaticRing {
  center: [number, number, number];
  normal: [number, number, number];
  radius: number;
}

export interface MoleculeModel {
  id: string;
  nameZh: string;
  nameEn: string;
  formulaDisplay: string;
  category: MoleculeCategory;
  geometry: string;
  symmetry: string;
  hybridization: string;
  dipoleMoment: string;
  bondAngleSummary: string;
  description: string;
  atoms: AtomNode[];
  bonds: BondEdge[];
  aromaticRings?: AromaticRing[];
}

export const MOLECULE_CATEGORY_LABELS: Record<MoleculeCategory, string> = {
  inorganic: '无机分子',
  organic: '基础有机',
  biomed: '医药与生物',
  crystal: '晶胞与同素异形体',
};

function buildDiamondUnitCell(): { atoms: AtomNode[]; bonds: BondEdge[] } {
  const a = 3.567; // Å, diamond lattice constant
  const coords: [number, number, number][] = [];

  // 8 corners
  for (let ix = 0; ix <= 1; ix++) {
    for (let iy = 0; iy <= 1; iy++) {
      for (let iz = 0; iz <= 1; iz++) {
        coords.push([ix * a, iy * a, iz * a]);
      }
    }
  }
  // 6 face centers
  const faces: [number, number, number][] = [
    [0.5, 0.5, 0],
    [0.5, 0.5, 1],
    [0.5, 0, 0.5],
    [0.5, 1, 0.5],
    [0, 0.5, 0.5],
    [1, 0.5, 0.5],
  ];
  for (const [fx, fy, fz] of faces) {
    coords.push([fx * a, fy * a, fz * a]);
  }
  // 4 interior tetrahedral sites
  const interior: [number, number, number][] = [
    [0.25, 0.25, 0.25],
    [0.75, 0.75, 0.25],
    [0.75, 0.25, 0.75],
    [0.25, 0.75, 0.75],
  ];
  for (const [tx, ty, tz] of interior) {
    coords.push([tx * a, ty * a, tz * a]);
  }

  const half = a / 2;
  const atoms: AtomNode[] = coords.map(([x, y, z], id) => ({
    id,
    element: 'C',
    x: Number((x - half).toFixed(4)),
    y: Number((y - half).toFixed(4)),
    z: Number((z - half).toFixed(4)),
  }));

  const bonds: BondEdge[] = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const dx = atoms[i].x - atoms[j].x;
      const dy = atoms[i].y - atoms[j].y;
      const dz = atoms[i].z - atoms[j].z;
      const dist = Math.hypot(dx, dy, dz);
      // Nearest neighbor in diamond is a * sqrt(3)/4 ≈ 1.5446 Å
      if (dist > 1.45 && dist < 1.65) {
        bonds.push({ from: i, to: j, order: 'single' });
      }
    }
  }

  return { atoms, bonds };
}

function buildNaClLattice(): { atoms: AtomNode[]; bonds: BondEdge[] } {
  const step = 2.15; // Visual lattice spacing scaled for crisp 3D clarity (actual Na-Cl = 2.82 Å)
  const atoms: AtomNode[] = [];
  let id = 0;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = -1; iy <= 1; iy++) {
      for (let iz = -1; iz <= 1; iz++) {
        const isNa = Math.abs(ix + iy + iz) % 2 === 0;
        atoms.push({
          id: id++,
          element: isNa ? 'Na' : 'Cl',
          x: Number((ix * step).toFixed(3)),
          y: Number((iy * step).toFixed(3)),
          z: Number((iz * step).toFixed(3)),
        });
      }
    }
  }

  const bonds: BondEdge[] = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const dx = atoms[i].x - atoms[j].x;
      const dy = atoms[i].y - atoms[j].y;
      const dz = atoms[i].z - atoms[j].z;
      const dist = Math.hypot(dx, dy, dz);
      if (Math.abs(dist - step) < 0.08) {
        bonds.push({ from: i, to: j, order: 'ionic' });
      }
    }
  }
  return { atoms, bonds };
}

function buildFullereneC60(): { atoms: AtomNode[]; bonds: BondEdge[] } {
  const phi = (1 + Math.sqrt(5)) / 2;
  const scale = 0.71; // Scales edge length of 2.0 to ~1.42 Å C-C bond length
  const rawSet = new Map<string, [number, number, number]>();

  const addEvenPermutations = (a: number, b: number, c: number) => {
    const perms: [number, number, number][] = [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ];
    const signs = [-1, 1];
    for (const [px, py, pz] of perms) {
      for (const sx of px === 0 ? [1] : signs) {
        for (const sy of py === 0 ? [1] : signs) {
          for (const sz of pz === 0 ? [1] : signs) {
            const x = px * sx * scale;
            const y = py * sy * scale;
            const z = pz * sz * scale;
            const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
            rawSet.set(key, [x, y, z]);
          }
        }
      }
    }
  };

  addEvenPermutations(0, 1, 3 * phi);
  addEvenPermutations(1, 2 + phi, 2 * phi);
  addEvenPermutations(phi, 2, 2 * phi + 1);

  const atoms: AtomNode[] = Array.from(rawSet.values()).map(([x, y, z], id) => ({
    id,
    element: 'C',
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    z: Number(z.toFixed(4)),
  }));

  // Each vertex in truncated icosahedron has 3 neighbors at distance 2 * scale = 1.42 Å.
  // Specifically, 1 bond separates two hexagons ([6,6] double bond) and 2 bonds separate a pentagon and hexagon ([5,6]).
  const adj: number[][] = Array.from({ length: atoms.length }, () => []);
  const edgeList: [number, number][] = [];

  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const dist = Math.hypot(
        atoms[i].x - atoms[j].x,
        atoms[i].y - atoms[j].y,
        atoms[i].z - atoms[j].z
      );
      if (dist > 1.32 && dist < 1.52) {
        adj[i].push(j);
        adj[j].push(i);
        edgeList.push([i, j]);
      }
    }
  }

  // Identify 5-membered pentagon rings: an edge belongs to a pentagon iff it is part of a 5-cycle.
  const inPentagon = new Set<string>();
  for (const [u, v] of edgeList) {
    // Check if there is a path u - a - b - c - v of length 4 (5-cycle)
    let foundFiveCycle = false;
    for (const a of adj[u]) {
      if (a === v) continue;
      for (const b of adj[a]) {
        if (b === u || b === v) continue;
        for (const c of adj[b]) {
          if (c === a || c === u || c === v) continue;
          if (adj[c].includes(v)) {
            foundFiveCycle = true;
            break;
          }
        }
        if (foundFiveCycle) break;
      }
      if (foundFiveCycle) break;
    }
    if (foundFiveCycle) {
      inPentagon.add(`${u}-${v}`);
    }
  }

  const bonds: BondEdge[] = edgeList.map(([from, to]) => ({
    from,
    to,
    order: inPentagon.has(`${from}-${to}`) ? 'single' : 'double',
  }));

  return { atoms, bonds };
}

function buildBenzene(): { atoms: AtomNode[]; bonds: BondEdge[]; aromaticRings: AromaticRing[] } {
  const rC = 1.397;
  const rH = 2.481;
  const atoms: AtomNode[] = [];
  const bonds: BondEdge[] = [];

  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3;
    atoms.push({
      id: i,
      element: 'C',
      x: Number((rC * Math.cos(theta)).toFixed(4)),
      y: Number((rC * Math.sin(theta)).toFixed(4)),
      z: 0,
    });
  }

  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3;
    atoms.push({
      id: i + 6,
      element: 'H',
      x: Number((rH * Math.cos(theta)).toFixed(4)),
      y: Number((rH * Math.sin(theta)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: i, to: (i + 1) % 6, order: 'aromatic' });
    bonds.push({ from: i, to: i + 6, order: 'single' });
  }

  return {
    atoms,
    bonds,
    aromaticRings: [{ center: [0, 0, 0], normal: [0, 0, 1], radius: 0.88 }],
  };
}

function buildCaffeine(): { atoms: AtomNode[]; bonds: BondEdge[]; aromaticRings: AromaticRing[] } {
  // Fused 6-membered pyrimidinedione + 5-membered imidazole purine skeleton in XY plane
  // 6-ring centered at (-0.7, 0, 0) with radius 1.40 Å:
  // Shared edge C4-C5 on the right side of the 6-ring (angles -30° and +30°)
  const cx6 = -0.75;
  const r6 = 1.40;
  // Ring atoms:
  // 0: C5 (cx6 + r6*cos(30°), r6*sin(30°)) = (-0.75 + 1.212, 0.70) = (0.462, 0.70, 0)
  // 1: C6 (cx6, 1.40, 0) = (-0.75, 1.40, 0) [carbonyl C=O]
  // 2: N1 (cx6 - 1.212, 0.70, 0) = (-1.962, 0.70, 0) [N-CH3]
  // 3: C2 (cx6 - 1.212, -0.70, 0) = (-1.962, -0.70, 0) [carbonyl C=O]
  // 4: N3 (cx6, -1.40, 0) = (-0.75, -1.40, 0) [N-CH3]
  // 5: C4 (cx6 + 1.212, -0.70, 0) = (0.462, -0.70, 0)
  // 5-membered imidazole ring fused to 0(C5) and 5(C4):
  // 6: N7 (1.76, 1.12, 0) [N-CH3]
  // 7: C8 (2.56, 0.00, 0) [C-H]
  // 8: N9 (1.76, -1.12, 0) [lone pair sp2 N]
  // Carbonyl oxygens:
  // 9: O6 on C6 (-0.75, 2.62, 0)
  // 10: O2 on C2 (-3.02, -1.31, 0)
  // Methyl carbons:
  // 11: C(N1) (-3.09, 1.62, 0)
  // 12: C(N3) (-0.75, -2.86, 0)
  // 13: C(N7) (2.21, 2.50, 0)
  // Imidazole H:
  // 14: H(C8) (3.64, 0.00, 0)
  const atoms: AtomNode[] = [
    { id: 0, element: 'C', x: 0.462, y: 0.70, z: 0 },
    { id: 1, element: 'C', x: -0.75, y: 1.40, z: 0 },
    { id: 2, element: 'N', x: -1.962, y: 0.70, z: 0 },
    { id: 3, element: 'C', x: -1.962, y: -0.70, z: 0 },
    { id: 4, element: 'N', x: -0.75, y: -1.40, z: 0 },
    { id: 5, element: 'C', x: 0.462, y: -0.70, z: 0 },
    { id: 6, element: 'N', x: 1.76, y: 1.12, z: 0 },
    { id: 7, element: 'C', x: 2.56, y: 0.0, z: 0 },
    { id: 8, element: 'N', x: 1.76, y: -1.12, z: 0 },
    { id: 9, element: 'O', x: -0.75, y: 2.62, z: 0 },
    { id: 10, element: 'O', x: -3.02, y: -1.31, z: 0 },
    { id: 11, element: 'C', x: -3.09, y: 1.62, z: 0 },
    { id: 12, element: 'C', x: -0.75, y: -2.86, z: 0 },
    { id: 13, element: 'C', x: 2.21, y: 2.50, z: 0 },
    { id: 14, element: 'H', x: 3.64, y: 0.0, z: 0 },
  ];

  const bonds: BondEdge[] = [
    { from: 0, to: 1, order: 'single' },
    { from: 1, to: 2, order: 'single' },
    { from: 2, to: 3, order: 'single' },
    { from: 3, to: 4, order: 'single' },
    { from: 4, to: 5, order: 'single' },
    { from: 5, to: 0, order: 'double' },
    { from: 0, to: 6, order: 'single' },
    { from: 6, to: 7, order: 'single' },
    { from: 7, to: 8, order: 'double' },
    { from: 8, to: 5, order: 'single' },
    { from: 1, to: 9, order: 'double' },
    { from: 3, to: 10, order: 'double' },
    { from: 2, to: 11, order: 'single' },
    { from: 4, to: 12, order: 'single' },
    { from: 6, to: 13, order: 'single' },
    { from: 7, to: 14, order: 'single' },
  ];

  // Add tetrahedral methyl hydrogens cleanly for C11, C12, C13 (9 H atoms -> total 24 atoms: C8 H10 N4 O2)
  const addMethylHydrogens = (cIdx: number, nIdx: number) => {
    const c = atoms[cIdx];
    const n = atoms[nIdx];
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular in XY plane is (-uy, ux, 0) and out-of-plane is (0, 0, 1)
    const cosT = Math.cos((70.5 * Math.PI) / 180); // ~0.3338 along axis
    const sinT = Math.sin((70.5 * Math.PI) / 180); // ~0.9426 radial
    const rCH = 1.09;

    for (let k = 0; k < 3; k++) {
      const phi = (k * 2 * Math.PI) / 3 + Math.PI / 6;
      const rx = -uy * Math.cos(phi);
      const ry = ux * Math.cos(phi);
      const rz = Math.sin(phi);
      const hId = atoms.length;
      atoms.push({
        id: hId,
        element: 'H',
        x: Number((c.x + rCH * (ux * cosT + rx * sinT)).toFixed(4)),
        y: Number((c.y + rCH * (uy * cosT + ry * sinT)).toFixed(4)),
        z: Number((c.z + rCH * rz * sinT).toFixed(4)),
      });
      bonds.push({ from: cIdx, to: hId, order: 'single' });
    }
  };

  addMethylHydrogens(11, 2);
  addMethylHydrogens(12, 4);
  addMethylHydrogens(13, 6);

  return {
    atoms,
    bonds,
    aromaticRings: [{ center: [1.40, 0, 0], normal: [0, 0, 1], radius: 0.68 }],
  };
}

function buildAspirin(): { atoms: AtomNode[]; bonds: BondEdge[]; aromaticRings: AromaticRing[] } {
  // Acetylsalicylic acid: C9 H8 O4 (21 atoms)
  const rC = 1.397;
  const atoms: AtomNode[] = [];
  const bonds: BondEdge[] = [];

  // 0..5: Benzene ring centered at (-0.9, 0, 0)
  const cx = -0.9;
  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3;
    atoms.push({
      id: i,
      element: 'C',
      x: Number((cx + rC * Math.cos(theta)).toFixed(4)),
      y: Number((rC * Math.sin(theta)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: i, to: (i + 1) % 6, order: 'aromatic' });
  }

  // Substituent 1 at C0 (theta = 0 -> x = 0.497, y = 0): Carboxylic acid -C(=O)OH
  // 6: C7 (carboxyl C) at (1.98, 0.12, 0)
  // 7: O1 (=O) at (2.58, 1.16, 0.25)
  // 8: O2 (-OH) at (2.64, -1.04, -0.25)
  // 9: H(O2) at (3.59, -0.89, -0.22)
  atoms.push(
    { id: 6, element: 'C', x: 1.98, y: 0.12, z: 0 },
    { id: 7, element: 'O', x: 2.58, y: 1.16, z: 0.25 },
    { id: 8, element: 'O', x: 2.64, y: -1.04, z: -0.25 },
    { id: 9, element: 'H', x: 3.59, y: -0.89, z: -0.22 }
  );
  bonds.push(
    { from: 0, to: 6, order: 'single' },
    { from: 6, to: 7, order: 'double' },
    { from: 6, to: 8, order: 'single' },
    { from: 8, to: 9, order: 'single' }
  );

  // Substituent 2 at C1 (theta = 60° -> x = -0.2015, y = 1.210): Ester -O-C(=O)-CH3
  // 10: O3 (ester phenolic O) at (0.48, 2.42, 0.10)
  // 11: C8 (acetyl carbonyl C) at (0.92, 3.08, -0.98)
  // 12: O4 (acetyl =O) at (0.74, 2.68, -2.12)
  // 13: C9 (methyl C) at (1.64, 4.36, -0.64)
  atoms.push(
    { id: 10, element: 'O', x: 0.48, y: 2.42, z: 0.10 },
    { id: 11, element: 'C', x: 0.92, y: 3.08, z: -0.98 },
    { id: 12, element: 'O', x: 0.74, y: 2.68, z: -2.12 },
    { id: 13, element: 'C', x: 1.64, y: 4.36, z: -0.64 }
  );
  bonds.push(
    { from: 1, to: 10, order: 'single' },
    { from: 10, to: 11, order: 'single' },
    { from: 11, to: 12, order: 'double' },
    { from: 11, to: 13, order: 'single' }
  );

  // 4 Aromatic hydrogens on C2, C3, C4, C5 (ids 14..17)
  const rH = 2.481;
  for (const ringIdx of [2, 3, 4, 5]) {
    const theta = (ringIdx * Math.PI) / 3;
    const hId = atoms.length;
    atoms.push({
      id: hId,
      element: 'H',
      x: Number((cx + rH * Math.cos(theta)).toFixed(4)),
      y: Number((rH * Math.sin(theta)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: ringIdx, to: hId, order: 'single' });
  }

  // 3 Methyl hydrogens on C9 (id 13) -> ids 18, 19, 20 (total 21 atoms)
  atoms.push(
    { id: 18, element: 'H', x: 2.56, y: 4.14, z: -0.10 },
    { id: 19, element: 'H', x: 1.88, y: 4.88, z: -1.56 },
    { id: 20, element: 'H', x: 1.00, y: 5.01, z: -0.04 }
  );
  bonds.push(
    { from: 13, to: 18, order: 'single' },
    { from: 13, to: 19, order: 'single' },
    { from: 13, to: 20, order: 'single' }
  );

  return {
    atoms,
    bonds,
    aromaticRings: [{ center: [cx, 0, 0], normal: [0, 0, 1], radius: 0.88 }],
  };
}

const benzeneData = buildBenzene();
const caffeineData = buildCaffeine();
const aspirinData = buildAspirin();
const diamondData = buildDiamondUnitCell();
const naclData = buildNaClLattice();
const c60Data = buildFullereneC60();

export const MOLECULES: MoleculeModel[] = [
  {
    id: 'caffeine',
    nameZh: '咖啡因',
    nameEn: 'Caffeine',
    formulaDisplay: 'C₈H₁₀N₄O₂',
    category: 'biomed',
    geometry: '稠合嘌呤双环平面骨架 + 3个四面体甲基',
    symmetry: 'C₁ (平面共轭核近似 Cₛ)',
    hybridization: '环原子 sp² · 甲基碳 sp³',
    dipoleMoment: '3.64 D',
    bondAngleSummary: '六元环 ~120° · 五元咪唑环 ~108° · 甲基 109.5°',
    description:
      '天然黄嘌呤生物碱中枢神经兴奋剂。分子由嘧啶二酮六元环与咪唑五元环稠合构成共轭平面，三个氮原子上连接四面体构型的甲基基团，可竞争性拮抗腺苷受体。',
    atoms: caffeineData.atoms,
    bonds: caffeineData.bonds,
    aromaticRings: caffeineData.aromaticRings,
  },
  {
    id: 'water',
    nameZh: '水分子',
    nameEn: 'Water',
    formulaDisplay: 'H₂O',
    category: 'inorganic',
    geometry: 'V形（折线型）构型',
    symmetry: 'C₂ᵥ 点群',
    hybridization: '氧原子不等性 sp³ 杂化',
    dipoleMoment: '1.85 D',
    bondAngleSummary: 'H–O–H 104.5°',
    description:
      '生命体系最核心的极性溶剂分子。中心氧原子拥有两对孤对电子，孤对电子对成键电子对的排斥作用将正四面体角（109.5°）压缩至104.5°，赋予水高沸点与氢键网络特性。',
    atoms: [
      { id: 0, element: 'O', x: 0, y: 0.1173, z: 0 },
      { id: 1, element: 'H', x: 0.7572, y: -0.4692, z: 0 },
      { id: 2, element: 'H', x: -0.7572, y: -0.4692, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
    ],
  },
  {
    id: 'benzene',
    nameZh: '苯',
    nameEn: 'Benzene',
    formulaDisplay: 'C₆H₆',
    category: 'organic',
    geometry: '平面正六边形大π键体系',
    symmetry: 'D₆ₕ 高对称点群',
    hybridization: '碳原子等性 sp² 杂化 (Π₆⁶ 离域大π键)',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'C–C–C 120.0° · C–C–H 120.0°',
    description:
      '芳香烃的母体原型分子。六个碳原子各以sp²杂化轨道形成正六边形σ骨架，未杂化的2p_z轨道垂直于环平面肩并肩重叠形成完全离域的六中心六电子大π键，C–C键长均一化为1.40 Å。',
    atoms: benzeneData.atoms,
    bonds: benzeneData.bonds,
    aromaticRings: benzeneData.aromaticRings,
  },
  {
    id: 'methane',
    nameZh: '甲烷',
    nameEn: 'Methane',
    formulaDisplay: 'CH₄',
    category: 'organic',
    geometry: '正四面体构型',
    symmetry: 'T_d 点群',
    hybridization: '碳原子等性 sp³ 杂化',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'H–C–H 109.5°',
    description:
      '最简单的饱和烷烃与天然气主要成分。中心碳原子采用标准sp³杂化，四个C–H共价单键键长严格相等（1.09 Å），完美抵消偶极矩形成非极性分子。',
    atoms: [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'H', x: 0.6293, y: 0.6293, z: 0.6293 },
      { id: 2, element: 'H', x: 0.6293, y: -0.6293, z: -0.6293 },
      { id: 3, element: 'H', x: -0.6293, y: 0.6293, z: -0.6293 },
      { id: 4, element: 'H', x: -0.6293, y: -0.6293, z: 0.6293 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
    ],
  },
  {
    id: 'ethanol',
    nameZh: '乙醇',
    nameEn: 'Ethanol',
    formulaDisplay: 'C₂H₅OH',
    category: 'organic',
    geometry: '交叉式四面体碳链 + 折线型羟基',
    symmetry: 'Cₛ 点群 (反式交叉构象)',
    hybridization: 'C、O 均为 sp³ 杂化',
    dipoleMoment: '1.69 D',
    bondAngleSummary: 'C–C–O 108.0° · C–O–H 105.0°',
    description:
      '典型的伯醇分子，兼具疏水性乙基碳链与亲水性极性羟基（–OH），因此既能与水以任意比例互溶，又能溶解多种非极性有机化合物。',
    atoms: [
      { id: 0, element: 'C', x: -1.18, y: -0.24, z: 0 },
      { id: 1, element: 'C', x: 0.08, y: 0.61, z: 0 },
      { id: 2, element: 'O', x: 1.24, y: -0.21, z: 0 },
      { id: 3, element: 'H', x: 2.02, y: 0.36, z: 0 },
      { id: 4, element: 'H', x: -2.07, y: 0.39, z: 0 },
      { id: 5, element: 'H', x: -1.21, y: -0.88, z: 0.89 },
      { id: 6, element: 'H', x: -1.21, y: -0.88, z: -0.89 },
      { id: 7, element: 'H', x: 0.09, y: 1.26, z: 0.89 },
      { id: 8, element: 'H', x: 0.09, y: 1.26, z: -0.89 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 1, to: 2, order: 'single' },
      { from: 2, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 0, to: 5, order: 'single' },
      { from: 0, to: 6, order: 'single' },
      { from: 1, to: 7, order: 'single' },
      { from: 1, to: 8, order: 'single' },
    ],
  },
  {
    id: 'acetylene',
    nameZh: '乙炔',
    nameEn: 'Acetylene',
    formulaDisplay: 'C₂H₂',
    category: 'organic',
    geometry: '直线型共价叁键构型',
    symmetry: 'D_∞h 点群',
    hybridization: '碳原子 sp 杂化 (1个σ键 + 2个正交π键)',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'H–C≡C 180.0°',
    description:
      '最简单的炔烃分子。两个碳原子通过sp杂化轨道头碰头形成σ键，并由两对相互垂直的2p轨道形成圆柱形电子云分布的碳碳叁键（键长缩短至1.20 Å），氧炔焰温度可达3200 °C。',
    atoms: [
      { id: 0, element: 'C', x: -0.601, y: 0, z: 0 },
      { id: 1, element: 'C', x: 0.601, y: 0, z: 0 },
      { id: 2, element: 'H', x: -1.662, y: 0, z: 0 },
      { id: 3, element: 'H', x: 1.662, y: 0, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'triple' },
      { from: 0, to: 2, order: 'single' },
      { from: 1, to: 3, order: 'single' },
    ],
  },
  {
    id: 'ammonia',
    nameZh: '氨分子',
    nameEn: 'Ammonia',
    formulaDisplay: 'NH₃',
    category: 'inorganic',
    geometry: '三角锥形构型',
    symmetry: 'C₃ᵥ 点群',
    hybridization: '氮原子不等性 sp³ 杂化',
    dipoleMoment: '1.47 D',
    bondAngleSummary: 'H–N–H 107.3°',
    description:
      '哈伯-博施工业固氮合成的核心产物。氮原子顶端占据一对孤对电子，使三个N–H键呈三角锥形分布（键角107.3°），孤对电子赋予氨显著的路易斯碱性与配位能力。',
    atoms: [
      { id: 0, element: 'N', x: 0, y: 0.281, z: 0 },
      { id: 1, element: 'H', x: 0.942, y: -0.094, z: 0 },
      { id: 2, element: 'H', x: -0.471, y: -0.094, z: 0.8158 },
      { id: 3, element: 'H', x: -0.471, y: -0.094, z: -0.8158 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
    ],
  },
  {
    id: 'co2',
    nameZh: '二氧化碳',
    nameEn: 'Carbon Dioxide',
    formulaDisplay: 'CO₂',
    category: 'inorganic',
    geometry: '对称直线型构型',
    symmetry: 'D_∞h 点群',
    hybridization: '碳原子 sp 杂化 (Π₃⁴ 离域π键)',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'O=C=O 180.0°',
    description:
      '地球碳循环与光合作用的核心无机碳源。尽管每个C=O双键具有强极性，但180°严格中心对称使偶极矩完全抵消；其非对称伸缩与弯曲振动模态可强烈吸收红外辐射。',
    atoms: [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'O', x: 1.162, y: 0, z: 0 },
      { id: 2, element: 'O', x: -1.162, y: 0, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'double' },
    ],
  },
  {
    id: 'sulfuric-acid',
    nameZh: '硫酸',
    nameEn: 'Sulfuric Acid',
    formulaDisplay: 'H₂SO₄',
    category: 'inorganic',
    geometry: '畸变四面体构型',
    symmetry: 'C₂ 点群',
    hybridization: '硫原子 sp³ 杂化 + d–p π反馈配键',
    dipoleMoment: '2.72 D',
    bondAngleSummary: 'O=S=O 123.3° · HO–S–OH 96.0°',
    description:
      '现代化学工业的基石强酸。+6价中心硫原子与两个端基氧形成键长较短（1.42 Å）的双键，双键大电子云密度强烈排斥两个羟基氧（S–OH 1.57 Å），导致四面体键角显著分化。',
    atoms: [
      { id: 0, element: 'S', x: 0, y: 0.12, z: 0 },
      { id: 1, element: 'O', x: 1.25, y: 0.79, z: 0 },
      { id: 2, element: 'O', x: -1.25, y: 0.79, z: 0 },
      { id: 3, element: 'O', x: 0, y: -0.92, z: 1.17 },
      { id: 4, element: 'O', x: 0, y: -0.92, z: -1.17 },
      { id: 5, element: 'H', x: 0.78, y: -1.49, z: 1.23 },
      { id: 6, element: 'H', x: -0.78, y: -1.49, z: -1.23 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'double' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 3, to: 5, order: 'single' },
      { from: 4, to: 6, order: 'single' },
    ],
  },
  {
    id: 'aspirin',
    nameZh: '阿司匹林 (乙酰水杨酸)',
    nameEn: 'Aspirin',
    formulaDisplay: 'C₉H₈O₄',
    category: 'biomed',
    geometry: '邻位双取代苯环 + 羧基与乙酰氧基',
    symmetry: 'C₁ 非对称构象',
    hybridization: '芳环及羰基 sp² · 甲基及酯氧 sp³',
    dipoleMoment: '2.07 D',
    bondAngleSummary: '芳环 120.0° · 酯基 C–O–C 118° · 甲基 109.5°',
    description:
      '人类医药史上应用最广泛的解热镇痛与抗血小板聚集药物。分子在苯环邻位同时带有羧基（–COOH）和乙酰氧基（–OCOCH₃），可通过不可逆乙酰化修饰环氧合酶（COX）丝氨酸残基发挥药效。',
    atoms: aspirinData.atoms,
    bonds: aspirinData.bonds,
    aromaticRings: aspirinData.aromaticRings,
  },
  {
    id: 'diamond',
    nameZh: '金刚石晶胞',
    nameEn: 'Diamond Cubic Unit Cell',
    formulaDisplay: 'C (金刚石晶胞)',
    category: 'crystal',
    geometry: '面心立方穿插四面体共价晶格',
    symmetry: 'Fd3̄m 空间群 (O_h)',
    hybridization: '全部碳原子等性 sp³ 杂化',
    dipoleMoment: '0.00 D (非极性共价晶体)',
    bondAngleSummary: 'C–C–C 109.5° · 晶格常数 a = 3.567 Å',
    description:
      '自然界莫氏硬度最高（10级）与室温热导率极高的碳同素异形体。晶胞内每个sp³碳原子与周围4个碳原子形成等长（1.545 Å）强三维共价单键网络，宽禁带（5.47 eV）使其高度透明绝缘。',
    atoms: diamondData.atoms,
    bonds: diamondData.bonds,
  },
  {
    id: 'nacl',
    nameZh: '氯化钠晶胞',
    nameEn: 'Sodium Chloride Lattice',
    formulaDisplay: 'NaCl (岩盐晶格)',
    category: 'crystal',
    geometry: '六配位八面体面心立方离子晶格',
    symmetry: 'Fm3̄m 空间群 (O_h)',
    hybridization: '离子键电静力库仑配位 (配位数 6:6)',
    dipoleMoment: '晶格电中性 (晶格能 787 kJ/mol)',
    bondAngleSummary: 'Na⁺–Cl⁻–Na⁺ 90.0° / 180.0°',
    description:
      'AB型离子晶体的经典岩盐结构原型。Na⁺与Cl⁻各自构成面心立方子晶格并沿晶轴平移半个晶胞穿插，每个离子均被6个异号离子以正八面体配位包围，呈现立方解理与高熔点（801 °C）。',
    atoms: naclData.atoms,
    bonds: naclData.bonds,
  },
  {
    id: 'fullerene-c60',
    nameZh: '富勒烯巴基球',
    nameEn: 'Buckminsterfullerene',
    formulaDisplay: 'C₆₀',
    category: 'crystal',
    geometry: '截角二十面体笼状球形分子 (12五边形 + 20六边形)',
    symmetry: 'I_h 二十面体点群 (120种对称操作)',
    hybridization: '曲面张力 sp²·²⁸ 杂化',
    dipoleMoment: '0.00 D',
    bondAngleSummary: '六边形内角 120.0° · 五边形内角 108.0°',
    description:
      '零维碳纳米材料的里程碑分子（1996年诺贝尔化学奖）。60个等价碳原子位于球面截角二十面体顶点，遵循“孤立五元环规则”：30根六-六环共用双键（~1.39 Å）与60根五-六环共用单键（~1.45 Å）交替排列。',
    atoms: c60Data.atoms,
    bonds: c60Data.bonds,
  },
  {
    id: 'oxygen',
    nameZh: '氧气',
    nameEn: 'Dioxygen',
    formulaDisplay: 'O₂',
    category: 'inorganic',
    geometry: '双原子直线型构型',
    symmetry: 'D_∞h 点群',
    hybridization: '氧原子 sp² 杂化 (含两个反键 π* 单电子，具顺磁性)',
    dipoleMoment: '0.00 D',
    bondAngleSummary: '双原子分子 (O=O 键长 1.208 Å)',
    description:
      '地球大气核心助燃与有氧代谢氧化剂。分子轨道中两个简并 π* 反键轨道各占一个自旋平行未成对电子，使基态氧气呈三重态双自由基（³Σ_g⁻）并具有液态顺磁性。',
    atoms: [
      { id: 0, element: 'O', x: -0.604, y: 0, z: 0 },
      { id: 1, element: 'O', x: 0.604, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'double' }],
  },
  {
    id: 'hydrogen',
    nameZh: '氢气',
    nameEn: 'Dihydrogen',
    formulaDisplay: 'H₂',
    category: 'inorganic',
    geometry: '双原子直线型构型',
    symmetry: 'D_∞h 点群',
    hybridization: '1s–1s 头碰头 σ 共价单键',
    dipoleMoment: '0.00 D',
    bondAngleSummary: '双原子分子 (H–H 键长 0.741 Å)',
    description:
      '宇宙中丰度最高、相对分子质量最小的双原子单质分子。两个氢原子 1s 轨道重叠形成高键能（436 kJ/mol）σ 键，既是清洁零碳燃料，也是工业加氢还原的核心试剂。',
    atoms: [
      { id: 0, element: 'H', x: -0.3705, y: 0, z: 0 },
      { id: 1, element: 'H', x: 0.3705, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'single' }],
  },
  {
    id: 'chlorine',
    nameZh: '氯气',
    nameEn: 'Dichlorine',
    formulaDisplay: 'Cl₂',
    category: 'inorganic',
    geometry: '双原子直线型构型',
    symmetry: 'D_∞h 点群',
    hybridization: '3p_x–3p_x 头碰头 σ 共价单键',
    dipoleMoment: '0.00 D',
    bondAngleSummary: '双原子分子 (Cl–Cl 键长 1.988 Å)',
    description:
      '黄绿色强氧化性卤素单质气体。Cl–Cl 单键键能较低（243 kJ/mol），在紫外光或受热条件下极易均裂产生高活性氯自由基，广泛用于有机卤代、加成及自来水消毒。',
    atoms: [
      { id: 0, element: 'Cl', x: -0.994, y: 0, z: 0 },
      { id: 1, element: 'Cl', x: 0.994, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'single' }],
  },
  {
    id: 'hcl',
    nameZh: '氯化氢 (盐酸)',
    nameEn: 'Hydrogen Chloride',
    formulaDisplay: 'HCl',
    category: 'inorganic',
    geometry: '极性双原子直线型构型',
    symmetry: 'C_∞v 点群',
    hybridization: 'H(1s)–Cl(3p) 极性 σ 共价键',
    dipoleMoment: '1.08 D',
    bondAngleSummary: '双原子分子 (H–Cl 键长 1.275 Å)',
    description:
      '典型的强极性共价氢化物，氯原子强电负性使电子云显著偏向 Cl 端，溶于水后完全电离为水合氢离子（H₃O⁺）与氯离子（Cl⁻）即盐酸，是酸碱中和与亲电加成的重要试剂。',
    atoms: [
      { id: 0, element: 'H', x: -0.92, y: 0, z: 0 },
      { id: 1, element: 'Cl', x: 0.355, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'single' }],
  },
  {
    id: 'naoh',
    nameZh: '氢氧化钠',
    nameEn: 'Sodium Hydroxide',
    formulaDisplay: 'NaOH',
    category: 'inorganic',
    geometry: '离子配位折线/准直线单元',
    symmetry: 'C_∞v / C_s 离子对单元',
    hybridization: 'Na⁺ 与 OH⁻ 离子键 + O–H 极性共价键',
    dipoleMoment: '6.83 D (气相离子对)',
    bondAngleSummary: 'Na⁺···O–H 离子配位 (O–H 键长 0.96 Å)',
    description:
      '俗称烧碱或苛性钠的典型强碱。由钠阳离子（Na⁺）与氢氧根阴离子（OH⁻）构成，水溶液中完全解离释放高浓度 OH⁻，广泛用于酸碱中和、皂化水解及酸性气体吸收。',
    atoms: [
      { id: 0, element: 'Na', x: -1.32, y: 0, z: 0 },
      { id: 1, element: 'O', x: 0.63, y: 0, z: 0 },
      { id: 2, element: 'H', x: 1.59, y: 0, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'ionic' },
      { from: 1, to: 2, order: 'single' },
    ],
  },
  {
    id: 'acetic-acid',
    nameZh: '乙酸 (醋酸)',
    nameEn: 'Acetic Acid',
    formulaDisplay: 'CH₃COOH',
    category: 'organic',
    geometry: '四面体甲基 + 平面三角形羧基',
    symmetry: 'C_s 点群',
    hybridization: '甲基碳 sp³ · 羧基碳 sp² (p–π 共轭)',
    dipoleMoment: '1.74 D',
    bondAngleSummary: 'O=C–O 123.0° · H–C–H 109.5°',
    description:
      '食醋风味的核心有机弱酸与重要化工原料。分子内羧基（–COOH）中羟基氧孤对电子与羰基 π 键发生 p–π 共轭，削弱 O–H 键极性释放质子，并可与醇类发生经典费歇尔酯化反应。',
    atoms: [
      { id: 0, element: 'C', x: -0.76, y: -0.05, z: 0 },
      { id: 1, element: 'C', x: 0.74, y: 0.08, z: 0 },
      { id: 2, element: 'O', x: 1.33, y: 1.13, z: 0 },
      { id: 3, element: 'O', x: 1.38, y: -1.11, z: 0 },
      { id: 4, element: 'H', x: 2.34, y: -0.96, z: 0 },
      { id: 5, element: 'H', x: -1.19, y: 0.95, z: 0 },
      { id: 6, element: 'H', x: -1.11, y: -0.59, z: 0.89 },
      { id: 7, element: 'H', x: -1.11, y: -0.59, z: -0.89 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 1, to: 2, order: 'double' },
      { from: 1, to: 3, order: 'single' },
      { from: 3, to: 4, order: 'single' },
      { from: 0, to: 5, order: 'single' },
      { from: 0, to: 6, order: 'single' },
      { from: 0, to: 7, order: 'single' },
    ],
  },
];

export const MOLECULE_BY_ID: Record<string, MoleculeModel> = Object.fromEntries(
  MOLECULES.map((m) => [m.id, m])
);
