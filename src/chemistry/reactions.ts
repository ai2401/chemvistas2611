import { AtomNode, BondEdge, MOLECULE_BY_ID, MoleculeModel } from './molecules';
import { addBondedAtomWithVsepr, connectOrUpdateBond } from './moleculeBuilder';
import { formatMolecularFormula } from './structureParser';

export interface ReactionSpeciesTerm {
  coefficient: number;
  molecule: MoleculeModel;
  roleLabel?: string;
  phaseTag?: '(g)' | '(l)' | '(s)' | '(aq)';
}

export interface AtomConservationRow {
  element: string;
  reactantAtoms: number;
  productAtoms: number;
  balanced: boolean;
}

export interface ReactionSimulationResult {
  id: string;
  occurs: boolean;
  reversible: boolean;
  reactionType: string;
  condition: string;
  enthalpyKjPerMol: number; // ΔH < 0 exothermic, ΔH > 0 endothermic
  activationEnergyKj: number; // Ea barrier for energy coordinate plot
  reactants: ReactionSpeciesTerm[];
  products: ReactionSpeciesTerm[];
  equationText: string;
  bondsBroken: string;
  bondsFormed: string;
  mechanismSummary: string;
  phenomenonNote: string;
  atomBalance: AtomConservationRow[];
  isAtomBalanced: boolean;
}

export interface ReactionPreset {
  id: string;
  label: string;
  reactantAId: string;
  reactantBId: string;
}

export const CLASSIC_REACTION_PRESETS: ReactionPreset[] = [
  {
    id: 'preset-combustion',
    label: '甲烷完全燃烧',
    reactantAId: 'methane',
    reactantBId: 'oxygen',
  },
  {
    id: 'preset-esterification',
    label: '乙酸乙酯酯化',
    reactantAId: 'acetic-acid',
    reactantBId: 'ethanol',
  },
  {
    id: 'preset-neutralization',
    label: '强酸强碱中和',
    reactantAId: 'hcl',
    reactantBId: 'naoh',
  },
  {
    id: 'preset-hydrogenation',
    label: '乙炔催化加氢',
    reactantAId: 'acetylene',
    reactantBId: 'hydrogen',
  },
  {
    id: 'preset-ammonia-hcl',
    label: '氨氯白烟化合',
    reactantAId: 'ammonia',
    reactantBId: 'hcl',
  },
  {
    id: 'preset-urea',
    label: '工业合成尿素',
    reactantAId: 'ammonia',
    reactantBId: 'co2',
  },
  {
    id: 'preset-chlorination',
    label: '甲烷光照氯代',
    reactantAId: 'methane',
    reactantBId: 'chlorine',
  },
  {
    id: 'preset-aspirin-hydrolysis',
    label: '阿司匹林水解',
    reactantAId: 'aspirin',
    reactantBId: 'water',
  },
  {
    id: 'preset-steam-reforming',
    label: '蒸汽重整制氢',
    reactantAId: 'methane',
    reactantBId: 'water',
  },
  {
    id: 'preset-trimerization',
    label: '乙炔三聚成苯',
    reactantAId: 'acetylene',
    reactantBId: 'acetylene',
  },
];

// ============================================================================
// Dedicated 3D Reaction Product Models (Accurate Ångström Geometries)
// ============================================================================

function buildCyclohexaneChair(): { atoms: AtomNode[]; bonds: BondEdge[] } {
  const atoms: AtomNode[] = [];
  const bonds: BondEdge[] = [];
  const rC = 1.46;
  const puckZ = 0.26;

  // 6 Ring Carbons in chair conformation
  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3;
    const sign = i % 2 === 0 ? 1 : -1;
    atoms.push({
      id: i,
      element: 'C',
      x: Number((rC * Math.cos(theta)).toFixed(4)),
      y: Number((rC * Math.sin(theta)).toFixed(4)),
      z: Number((sign * puckZ).toFixed(4)),
    });
    bonds.push({ from: i, to: (i + 1) % 6, order: 'single' });
  }

  // 6 Axial + 6 Equatorial Hydrogens
  let hId = 6;
  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3;
    const sign = i % 2 === 0 ? 1 : -1;
    const c = atoms[i];
    // Axial H
    atoms.push({
      id: hId,
      element: 'H',
      x: Number((c.x * 1.04).toFixed(4)),
      y: Number((c.y * 1.04).toFixed(4)),
      z: Number((c.z + sign * 1.08).toFixed(4)),
    });
    bonds.push({ from: i, to: hId++, order: 'single' });

    // Equatorial H
    atoms.push({
      id: hId,
      element: 'H',
      x: Number((c.x + 1.03 * Math.cos(theta)).toFixed(4)),
      y: Number((c.y + 1.03 * Math.sin(theta)).toFixed(4)),
      z: Number((c.z - sign * 0.34).toFixed(4)),
    });
    bonds.push({ from: i, to: hId++, order: 'single' });
  }

  return { atoms, bonds };
}

function buildChlorobenzene(): { atoms: AtomNode[]; bonds: BondEdge[] } {
  const atoms: AtomNode[] = [];
  const bonds: BondEdge[] = [];
  const rC = 1.397;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    atoms.push({
      id: i,
      element: 'C',
      x: Number((rC * Math.cos(angle)).toFixed(4)),
      y: Number((rC * Math.sin(angle)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: i, to: (i + 1) % 6, order: 'aromatic' });
  }
  // C0 bears Chlorine (C-Cl = 1.74 Å), C1..C5 bear Hydrogens
  atoms.push({
    id: 6,
    element: 'Cl',
    x: Number((rC + 1.74).toFixed(4)),
    y: 0,
    z: 0,
  });
  bonds.push({ from: 0, to: 6, order: 'single' });

  for (let i = 1; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    atoms.push({
      id: 6 + i,
      element: 'H',
      x: Number(((rC + 1.085) * Math.cos(angle)).toFixed(4)),
      y: Number(((rC + 1.085) * Math.sin(angle)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: i, to: 6 + i, order: 'single' });
  }
  return { atoms, bonds };
}

function buildSalicylicAcid(): { atoms: AtomNode[]; bonds: BondEdge[] } {
  // C7H6O3: Benzene ring (C0..C5) + C0-COOH (C6, =O7, -O8-H9) + C1-OH (-O10-H11) + 4 ring H (H12..H15)
  const atoms: AtomNode[] = [];
  const bonds: BondEdge[] = [];
  const rC = 1.395;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    atoms.push({
      id: i,
      element: 'C',
      x: Number((rC * Math.cos(a)).toFixed(4)),
      y: Number((rC * Math.sin(a)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: i, to: (i + 1) % 6, order: 'aromatic' });
  }
  // Carboxyl at C0 (x = 1.395, y = 0)
  atoms.push(
    { id: 6, element: 'C', x: 2.86, y: 0.05, z: 0 },
    { id: 7, element: 'O', x: 3.48, y: 1.1, z: 0 },
    { id: 8, element: 'O', x: 3.49, y: -1.14, z: 0 },
    { id: 9, element: 'H', x: 4.45, y: -1.02, z: 0 },
    // Phenolic OH at ortho C1 (angle 60°)
    { id: 10, element: 'O', x: 1.38, y: 2.39, z: 0 },
    { id: 11, element: 'H', x: 2.29, y: 2.08, z: 0 }
  );
  bonds.push(
    { from: 0, to: 6, order: 'single' },
    { from: 6, to: 7, order: 'double' },
    { from: 6, to: 8, order: 'single' },
    { from: 8, to: 9, order: 'single' },
    { from: 1, to: 10, order: 'single' },
    { from: 10, to: 11, order: 'single' }
  );
  for (let i = 2; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const hId = 10 + i; // 12, 13, 14, 15
    atoms.push({
      id: hId,
      element: 'H',
      x: Number(((rC + 1.085) * Math.cos(a)).toFixed(4)),
      y: Number(((rC + 1.085) * Math.sin(a)).toFixed(4)),
      z: 0,
    });
    bonds.push({ from: i, to: hId, order: 'single' });
  }
  return { atoms, bonds };
}

const cyclohexaneData = buildCyclohexaneChair();
const chlorobenzeneData = buildChlorobenzene();
const salicylicData = buildSalicylicAcid();

export const PRODUCT_MOLECULES: Record<string, MoleculeModel> = {
  ethylene: {
    id: 'prod-ethylene',
    nameZh: '乙烯',
    nameEn: 'Ethylene',
    formulaDisplay: 'C₂H₄',
    category: 'organic',
    geometry: '六原子共面双键构型',
    symmetry: 'D₂ₕ 点群',
    hybridization: '碳原子 sp² 杂化 (1个σ键 + 1个π键)',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'H–C=C 121.3° · H–C–H 117.4°',
    description:
      '现代石油化工核心基础烯烃与植物内源催熟激素。C=C 双键限制自由旋转使六个原子严格共面，π 键富电子云易发生亲电加成与聚合反应。',
    atoms: [
      { id: 0, element: 'C', x: -0.669, y: 0, z: 0 },
      { id: 1, element: 'C', x: 0.669, y: 0, z: 0 },
      { id: 2, element: 'H', x: -1.234, y: 0.928, z: 0 },
      { id: 3, element: 'H', x: -1.234, y: -0.928, z: 0 },
      { id: 4, element: 'H', x: 1.234, y: 0.928, z: 0 },
      { id: 5, element: 'H', x: 1.234, y: -0.928, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 1, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'single' },
    ],
  },
  ethane: {
    id: 'prod-ethane',
    nameZh: '乙烷',
    nameEn: 'Ethane',
    formulaDisplay: 'C₂H₆',
    category: 'organic',
    geometry: '交叉式双四面体构象',
    symmetry: 'D₃d 点群 (交叉式最低能量构象)',
    hybridization: '碳原子 sp³ 杂化',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'H–C–C 111.2° · H–C–H 107.7°',
    description:
      '饱和烷烃同系物第二成员，两个甲基围绕 C–C σ 单键自由内旋转，室温下优先采取空间位阻最小的交叉式构象。',
    atoms: [
      { id: 0, element: 'C', x: -0.765, y: 0, z: 0 },
      { id: 1, element: 'C', x: 0.765, y: 0, z: 0 },
      { id: 2, element: 'H', x: -1.16, y: 1.02, z: 0 },
      { id: 3, element: 'H', x: -1.16, y: -0.51, z: 0.883 },
      { id: 4, element: 'H', x: -1.16, y: -0.51, z: -0.883 },
      { id: 5, element: 'H', x: 1.16, y: -1.02, z: 0 },
      { id: 6, element: 'H', x: 1.16, y: 0.51, z: 0.883 },
      { id: 7, element: 'H', x: 1.16, y: 0.51, z: -0.883 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'single' },
      { from: 1, to: 6, order: 'single' },
      { from: 1, to: 7, order: 'single' },
    ],
  },
  acetaldehyde: {
    id: 'prod-acetaldehyde',
    nameZh: '乙醛',
    nameEn: 'Acetaldehyde',
    formulaDisplay: 'CH₃CHO',
    category: 'organic',
    geometry: '四面体甲基 + 平面三角形醛基',
    symmetry: 'C_s 点群',
    hybridization: '甲基碳 sp³ · 醛基碳 sp²',
    dipoleMoment: '2.75 D',
    bondAngleSummary: 'C–C=O 124.0° · H–C=O 118.0°',
    description:
      '乙炔水合反应或乙醇催化氧化的核心醛类产物。极性羰基（C=O）碳原子带显著正电性，兼具亲核加成活性与强还原性（银镜反应）。',
    atoms: [
      { id: 0, element: 'C', x: -0.78, y: -0.12, z: 0 },
      { id: 1, element: 'C', x: 0.69, y: 0.14, z: 0 },
      { id: 2, element: 'O', x: 1.54, y: -0.72, z: 0 },
      { id: 3, element: 'H', x: 0.99, y: 1.21, z: 0 },
      { id: 4, element: 'H', x: -1.32, y: 0.83, z: 0 },
      { id: 5, element: 'H', x: -1.07, y: -0.69, z: 0.89 },
      { id: 6, element: 'H', x: -1.07, y: -0.69, z: -0.89 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 1, to: 2, order: 'double' },
      { from: 1, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 0, to: 5, order: 'single' },
      { from: 0, to: 6, order: 'single' },
    ],
  },
  'ethyl-acetate': {
    id: 'prod-ethyl-acetate',
    nameZh: '乙酸乙酯',
    nameEn: 'Ethyl Acetate',
    formulaDisplay: 'CH₃COOC₂H₅',
    category: 'organic',
    geometry: '平面酯基骨架 + 反式乙基链',
    symmetry: 'C_s 优势构象',
    hybridization: '羰基碳 sp² · 烷氧基及烷基 sp³',
    dipoleMoment: '1.78 D',
    bondAngleSummary: 'O=C–O 124.0° · C–O–C 116.0°',
    description:
      '由乙酸与乙醇经“酸脱羟基醇脱氢”费歇尔酯化生成的果香型低毒有机溶剂，广泛用于涂料、色谱洗脱与食品香精。',
    atoms: [
      { id: 0, element: 'C', x: -2.28, y: -0.18, z: 0 },
      { id: 1, element: 'C', x: -0.81, y: 0.12, z: 0 },
      { id: 2, element: 'O', x: -0.35, y: 1.24, z: 0 },
      { id: 3, element: 'O', x: -0.05, y: -1.0, z: 0 },
      { id: 4, element: 'C', x: 1.38, y: -0.85, z: 0 },
      { id: 5, element: 'C', x: 2.02, y: -2.22, z: 0 },
      { id: 6, element: 'H', x: -2.84, y: 0.75, z: 0 },
      { id: 7, element: 'H', x: -2.55, y: -0.76, z: 0.89 },
      { id: 8, element: 'H', x: -2.55, y: -0.76, z: -0.89 },
      { id: 9, element: 'H', x: 1.68, y: -0.29, z: 0.89 },
      { id: 10, element: 'H', x: 1.68, y: -0.29, z: -0.89 },
      { id: 11, element: 'H', x: 3.11, y: -2.13, z: 0 },
      { id: 12, element: 'H', x: 1.71, y: -2.78, z: 0.89 },
      { id: 13, element: 'H', x: 1.71, y: -2.78, z: -0.89 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 1, to: 2, order: 'double' },
      { from: 1, to: 3, order: 'single' },
      { from: 3, to: 4, order: 'single' },
      { from: 4, to: 5, order: 'single' },
      { from: 0, to: 6, order: 'single' },
      { from: 0, to: 7, order: 'single' },
      { from: 0, to: 8, order: 'single' },
      { from: 4, to: 9, order: 'single' },
      { from: 4, to: 10, order: 'single' },
      { from: 5, to: 11, order: 'single' },
      { from: 5, to: 12, order: 'single' },
      { from: 5, to: 13, order: 'single' },
    ],
  },
  chloromethane: {
    id: 'prod-chloromethane',
    nameZh: '一氯甲烷',
    nameEn: 'Chloromethane',
    formulaDisplay: 'CH₃Cl',
    category: 'organic',
    geometry: '极性四面体构型',
    symmetry: 'C₃ᵥ 点群',
    hybridization: '碳原子不等性 sp³ 杂化',
    dipoleMoment: '1.89 D',
    bondAngleSummary: 'H–C–Cl 108.0° · C–Cl 键长 1.78 Å',
    description:
      '甲烷光照自由基氯代反应的第一步取代产物，也是有机硅甲基化工业合成的核心原料。',
    atoms: [
      { id: 0, element: 'C', x: -0.35, y: 0, z: 0 },
      { id: 1, element: 'Cl', x: 1.43, y: 0, z: 0 },
      { id: 2, element: 'H', x: -0.71, y: 1.03, z: 0 },
      { id: 3, element: 'H', x: -0.71, y: -0.515, z: 0.892 },
      { id: 4, element: 'H', x: -0.71, y: -0.515, z: -0.892 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
    ],
  },
  'vinyl-chloride': {
    id: 'prod-vinyl-chloride',
    nameZh: '氯乙烯',
    nameEn: 'Vinyl Chloride',
    formulaDisplay: 'CH₂=CHCl',
    category: 'organic',
    geometry: '平面共轭烯基氯构型',
    symmetry: 'C_s 点群',
    hybridization: '碳原子 sp² 杂化 (Cl 孤对电子 p–π 共轭)',
    dipoleMoment: '1.45 D',
    bondAngleSummary: 'C=C–Cl 122.3°',
    description:
      '乙炔与氯化氢亲电加成制得的聚氯乙烯（PVC）塑料单体。氯原子 3p 孤对电子与 C=C π 键共轭使 C–Cl 键缩短并增强稳定性。',
    atoms: [
      { id: 0, element: 'C', x: -0.88, y: 0.12, z: 0 },
      { id: 1, element: 'C', x: 0.42, y: -0.18, z: 0 },
      { id: 2, element: 'Cl', x: 1.72, y: 0.96, z: 0 },
      { id: 3, element: 'H', x: -1.24, y: 1.14, z: 0 },
      { id: 4, element: 'H', x: -1.62, y: -0.67, z: 0 },
      { id: 5, element: 'H', x: 0.79, y: -1.2, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 1, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'single' },
    ],
  },
  dichloroethene: {
    id: 'prod-dichloroethene',
    nameZh: '反-1,2-二氯乙烯',
    nameEn: 'trans-1,2-Dichloroethene',
    formulaDisplay: 'CHCl=CHCl',
    category: 'organic',
    geometry: '中心对称反式平面双键构型',
    symmetry: 'C₂ₕ 点群',
    hybridization: '碳原子 sp² 杂化',
    dipoleMoment: '0.00 D (反式对称抵消)',
    bondAngleSummary: 'C=C–Cl 123.0°',
    description:
      '乙炔与一分子氯气发生反式亲电加成的主产物，两个氯原子分居双键两侧使分子偶极矩严格抵消。',
    atoms: [
      { id: 0, element: 'C', x: -0.665, y: 0, z: 0 },
      { id: 1, element: 'C', x: 0.665, y: 0, z: 0 },
      { id: 2, element: 'Cl', x: -1.62, y: 1.44, z: 0 },
      { id: 3, element: 'H', x: -1.19, y: -0.95, z: 0 },
      { id: 4, element: 'Cl', x: 1.62, y: -1.44, z: 0 },
      { id: 5, element: 'H', x: 1.19, y: 0.95, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 1, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'single' },
    ],
  },
  chlorobenzene: {
    id: 'prod-chlorobenzene',
    nameZh: '氯苯',
    nameEn: 'Chlorobenzene',
    formulaDisplay: 'C₆H₅Cl',
    category: 'organic',
    geometry: '平面一取代芳香环构型',
    symmetry: 'C₂ᵥ 点群',
    hybridization: '芳环碳 sp² 杂化',
    dipoleMoment: '1.69 D',
    bondAngleSummary: '芳环内角 120.0° · C–Cl 1.74 Å',
    description:
      '苯在路易斯酸（FeCl₃）催化下与氯气发生芳香亲电取代反应（S_EAr）生成的典型芳基卤代物。',
    atoms: chlorobenzeneData.atoms,
    bonds: chlorobenzeneData.bonds,
    aromaticRings: [{ center: [0, 0, 0], normal: [0, 0, 1], radius: 0.92 }],
  },
  cyclohexane: {
    id: 'prod-cyclohexane',
    nameZh: '环己烷 (椅式构象)',
    nameEn: 'Cyclohexane (Chair)',
    formulaDisplay: 'C₆H₁₂',
    category: 'organic',
    geometry: '无角张力椅式六元脂环构象',
    symmetry: 'D₃d 点群',
    hybridization: '碳原子等性 sp³ 杂化',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'C–C–C 111.4° (消除拜尔角张力)',
    description:
      '苯环经完全催化加氢生成的饱和脂环烃。通过非平面折叠形成著名的“椅式构象”，所有相邻碳上的 C–H 键均呈交叉式排布（6个直立键 a + 6个平伏键 e）。',
    atoms: cyclohexaneData.atoms,
    bonds: cyclohexaneData.bonds,
  },
  'carbonic-acid': {
    id: 'prod-carbonic-acid',
    nameZh: '碳酸',
    nameEn: 'Carbonic Acid',
    formulaDisplay: 'H₂CO₃',
    category: 'inorganic',
    geometry: '平面三角形中心碳骨架',
    symmetry: 'C₂ᵥ 点群',
    hybridization: '中心碳 sp² 杂化',
    dipoleMoment: '0.92 D',
    bondAngleSummary: 'O=C–O 125.0° · HO–C–OH 110.0°',
    description:
      '二氧化碳溶于水发生可逆水合反应生成的二元弱酸，构成人体血液 pH 缓冲体系与海洋碳汇的核心化学平衡。',
    atoms: [
      { id: 0, element: 'C', x: 0, y: 0.14, z: 0 },
      { id: 1, element: 'O', x: 0, y: 1.36, z: 0 },
      { id: 2, element: 'O', x: 1.12, y: -0.62, z: 0 },
      { id: 3, element: 'O', x: -1.12, y: -0.62, z: 0 },
      { id: 4, element: 'H', x: 1.92, y: -0.07, z: 0 },
      { id: 5, element: 'H', x: -1.92, y: -0.07, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 2, to: 4, order: 'single' },
      { from: 3, to: 5, order: 'single' },
    ],
  },
  urea: {
    id: 'prod-urea',
    nameZh: '尿素 (碳酰胺)',
    nameEn: 'Urea',
    formulaDisplay: 'CO(NH₂)₂',
    category: 'biomed',
    geometry: '平面共轭二酰胺构型',
    symmetry: 'C₂ᵥ 准平面点群',
    hybridization: '碳原子 sp² · 氮原子近 sp² 共轭',
    dipoleMoment: '4.56 D',
    bondAngleSummary: 'N–C=O 121.4° · N–C–N 117.2°',
    description:
      '维勒（Wöhler）首次人工合成打破无机与有机界限的里程碑分子，工业上由氨与二氧化碳在高温高压下直接合成，是含氮量最高的固体氮肥。',
    atoms: [
      { id: 0, element: 'C', x: 0, y: 0.12, z: 0 },
      { id: 1, element: 'O', x: 0, y: 1.34, z: 0 },
      { id: 2, element: 'N', x: 1.16, y: -0.58, z: 0 },
      { id: 3, element: 'N', x: -1.16, y: -0.58, z: 0 },
      { id: 4, element: 'H', x: 2.04, y: -0.09, z: 0 },
      { id: 5, element: 'H', x: 1.15, y: -1.59, z: 0 },
      { id: 6, element: 'H', x: -2.04, y: -0.09, z: 0 },
      { id: 7, element: 'H', x: -1.15, y: -1.59, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 2, to: 4, order: 'single' },
      { from: 2, to: 5, order: 'single' },
      { from: 3, to: 6, order: 'single' },
      { from: 3, to: 7, order: 'single' },
    ],
  },
  'ammonium-chloride': {
    id: 'prod-ammonium-chloride',
    nameZh: '氯化铵 (离子对)',
    nameEn: 'Ammonium Chloride',
    formulaDisplay: 'NH₄Cl',
    category: 'inorganic',
    geometry: '正四面体铵根 NH₄⁺ + 氯离子配位',
    symmetry: 'C₃ᵥ 离子对构象',
    hybridization: '氮原子等性 sp³ 杂化 + 离子键配位',
    dipoleMoment: '强极性离子晶体单元',
    bondAngleSummary: 'H–N–H 109.5°',
    description:
      '氨气与氯化氢气体相遇瞬间经质子转移生成的白色微晶烟雾（NH₄⁺Cl⁻），分子内同时包含极性共价键、配位共价键与离子键。',
    atoms: [
      { id: 0, element: 'N', x: -0.78, y: 0, z: 0 },
      { id: 1, element: 'H', x: 0.28, y: 0, z: 0 },
      { id: 2, element: 'H', x: -1.13, y: 0.98, z: 0 },
      { id: 3, element: 'H', x: -1.13, y: -0.49, z: 0.85 },
      { id: 4, element: 'H', x: -1.13, y: -0.49, z: -0.85 },
      { id: 5, element: 'Cl', x: 2.18, y: 0, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'ionic' },
    ],
  },
  'ammonia-hydrate': {
    id: 'prod-ammonia-hydrate',
    nameZh: '一水合氨',
    nameEn: 'Ammonia Monohydrate',
    formulaDisplay: 'NH₃·H₂O',
    category: 'inorganic',
    geometry: 'O–H···N 氢键缔合双分子复合物',
    symmetry: 'C_s 氢键构象',
    hybridization: 'N、O 均为不等性 sp³ 杂化',
    dipoleMoment: '3.12 D',
    bondAngleSummary: 'O–H···N 近直线氢键桥',
    description:
      '氨极易溶于水（体积比 1:700）并由水分子羟基氢指向氨孤对电子形成强分子间氢键，部分质子转移电离出 NH₄⁺ 与 OH⁻ 使氨水显弱碱性。',
    atoms: [
      { id: 0, element: 'N', x: -1.35, y: 0.05, z: 0 },
      { id: 1, element: 'H', x: -1.78, y: 0.97, z: 0 },
      { id: 2, element: 'H', x: -1.72, y: -0.46, z: 0.82 },
      { id: 3, element: 'H', x: -1.72, y: -0.46, z: -0.82 },
      { id: 4, element: 'H', x: 0.48, y: 0.02, z: 0 },
      { id: 5, element: 'O', x: 1.46, y: -0.02, z: 0 },
      { id: 6, element: 'H', x: 1.78, y: 0.89, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'ionic' },
      { from: 4, to: 5, order: 'single' },
      { from: 5, to: 6, order: 'single' },
    ],
  },
  'nacl-pair': {
    id: 'prod-nacl-pair',
    nameZh: '氯化钠',
    nameEn: 'Sodium Chloride Unit',
    formulaDisplay: 'NaCl',
    category: 'inorganic',
    geometry: '正负离子库仑配位单元',
    symmetry: 'C_∞v 化学计量单元',
    hybridization: 'Na⁺ 与 Cl⁻ 典型离子键',
    dipoleMoment: '9.00 D (气相离子对)',
    bondAngleSummary: 'Na⁺–Cl⁻ 核间距 2.36 Å',
    description:
      '盐酸与氢氧化钠发生强酸强碱中和反应生成的食盐化学计量单元（水溶液中以水合 Na⁺ 与 Cl⁻ 形式存在，蒸发结晶形成岩盐立方晶格）。',
    atoms: [
      { id: 0, element: 'Na', x: -1.18, y: 0, z: 0 },
      { id: 1, element: 'Cl', x: 1.18, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'ionic' }],
  },
  'sodium-sulfate': {
    id: 'prod-sodium-sulfate',
    nameZh: '硫酸钠',
    nameEn: 'Sodium Sulfate',
    formulaDisplay: 'Na₂SO₄',
    category: 'inorganic',
    geometry: '正四面体硫酸根 SO₄²⁻ + 双钠离子配位',
    symmetry: 'C₂ᵥ 离子配位单元',
    hybridization: '硫原子 sp³ 杂化 + 离子键配位',
    dipoleMoment: '强离子化合物',
    bondAngleSummary: 'O–S–O 109.5°',
    description:
      '硫酸与两分子氢氧化钠完全中和生成的正盐（十水合物俗称芒硝），中心硫酸根呈高度对称四面体构型。',
    atoms: [
      { id: 0, element: 'S', x: 0, y: 0, z: 0 },
      { id: 1, element: 'O', x: 1.19, y: 0.86, z: 0 },
      { id: 2, element: 'O', x: -1.19, y: 0.86, z: 0 },
      { id: 3, element: 'O', x: 0, y: -0.86, z: 1.19 },
      { id: 4, element: 'O', x: 0, y: -0.86, z: -1.19 },
      { id: 5, element: 'Na', x: 2.65, y: 0, z: 0 },
      { id: 6, element: 'Na', x: -2.65, y: 0, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'double' },
      { from: 0, to: 3, order: 'single' },
      { from: 0, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'ionic' },
      { from: 2, to: 6, order: 'ionic' },
    ],
  },
  'sodium-carbonate': {
    id: 'prod-sodium-carbonate',
    nameZh: '碳酸钠 (纯碱)',
    nameEn: 'Sodium Carbonate',
    formulaDisplay: 'Na₂CO₃',
    category: 'inorganic',
    geometry: '平面正三角形 CO₃²⁻ 离域π键 + 双 Na⁺ 配位',
    symmetry: 'C₂ᵥ 离子配位单元',
    hybridization: '碳原子 sp² 杂化 (Π₄⁶ 大π键)',
    dipoleMoment: '强离子电解质',
    bondAngleSummary: 'O–C–O 120.0°',
    description:
      '氢氧化钠溶液吸收二氧化碳生成的纯碱（苏打），碳酸根内三个 C–O 键因 Π₄⁶ 离域大π键而键长趋于均等，水溶液因水解显碱性。',
    atoms: [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'O', x: 0, y: 1.28, z: 0 },
      { id: 2, element: 'O', x: 1.11, y: -0.64, z: 0 },
      { id: 3, element: 'O', x: -1.11, y: -0.64, z: 0 },
      { id: 4, element: 'Na', x: 2.52, y: 0.45, z: 0 },
      { id: 5, element: 'Na', x: -2.52, y: 0.45, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 2, to: 4, order: 'ionic' },
      { from: 3, to: 5, order: 'ionic' },
    ],
  },
  'sodium-acetate': {
    id: 'prod-sodium-acetate',
    nameZh: '乙酸钠',
    nameEn: 'Sodium Acetate',
    formulaDisplay: 'CH₃COONa',
    category: 'organic',
    geometry: '共振羧酸根阴离子 + Na⁺ 离子配位',
    symmetry: 'C_s 离子配位构象',
    hybridization: '甲基碳 sp³ · 羧酸根碳 sp² (Π₃⁴ 共振)',
    dipoleMoment: '强极性有机酸盐',
    bondAngleSummary: 'O–C–O 126.0°',
    description:
      '乙酸与氢氧化钠中和生成的典型强碱弱酸盐，常用于配制 pH 缓冲溶液及过饱和热冰结晶实验。',
    atoms: [
      { id: 0, element: 'C', x: -1.42, y: 0, z: 0 },
      { id: 1, element: 'C', x: 0.09, y: 0, z: 0 },
      { id: 2, element: 'O', x: 0.72, y: 1.11, z: 0 },
      { id: 3, element: 'O', x: 0.72, y: -1.11, z: 0 },
      { id: 4, element: 'Na', x: 2.48, y: 0, z: 0 },
      { id: 5, element: 'H', x: -1.81, y: 1.02, z: 0 },
      { id: 6, element: 'H', x: -1.81, y: -0.51, z: 0.88 },
      { id: 7, element: 'H', x: -1.81, y: -0.51, z: -0.88 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 1, to: 2, order: 'double' },
      { from: 1, to: 3, order: 'single' },
      { from: 2, to: 4, order: 'ionic' },
      { from: 3, to: 4, order: 'ionic' },
      { from: 0, to: 5, order: 'single' },
      { from: 0, to: 6, order: 'single' },
      { from: 0, to: 7, order: 'single' },
    ],
  },
  hclo: {
    id: 'prod-hclo',
    nameZh: '次氯酸',
    nameEn: 'Hypochlorous Acid',
    formulaDisplay: 'HClO',
    category: 'inorganic',
    geometry: 'V形（折线型）三原子构型',
    symmetry: 'C_s 点群',
    hybridization: '氧原子不等性 sp³ 杂化',
    dipoleMoment: '1.30 D',
    bondAngleSummary: 'H–O–Cl 103.0°',
    description:
      '氯气溶于水发生歧化反应生成的弱酸但极强的氧化杀菌漂白剂，分子结构为 H–O–Cl（+1价氯）。',
    atoms: [
      { id: 0, element: 'O', x: -0.35, y: 0.28, z: 0 },
      { id: 1, element: 'H', x: -1.24, y: -0.09, z: 0 },
      { id: 2, element: 'Cl', x: 1.18, y: -0.14, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 0, to: 2, order: 'single' },
    ],
  },
  co: {
    id: 'prod-co',
    nameZh: '一氧化碳',
    nameEn: 'Carbon Monoxide',
    formulaDisplay: 'CO',
    category: 'inorganic',
    geometry: '双原子直线型叁键构型',
    symmetry: 'C_∞v 点群',
    hybridization: 'C、O 均采用 sp 杂化 (1个σ键 + 2个π键，含氧向碳反馈配键)',
    dipoleMoment: '0.11 D',
    bondAngleSummary: 'C≡O 极短高键能叁键 (1.128 Å，键能 1072 kJ/mol)',
    description:
      '甲烷水蒸气重整合成气（Syngas）与高炉炼铁的核心还原性气体，分子中含反馈配键使总键能超越 N≡N 成为已知最牢固的双原子化学键。',
    atoms: [
      { id: 0, element: 'C', x: -0.564, y: 0, z: 0 },
      { id: 1, element: 'O', x: 0.564, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'triple' }],
  },
  n2: {
    id: 'prod-n2',
    nameZh: '氮气',
    nameEn: 'Dinitrogen',
    formulaDisplay: 'N₂',
    category: 'inorganic',
    geometry: '双原子对称叁键构型',
    symmetry: 'D_∞h 点群',
    hybridization: '氮原子 sp 杂化 (1个σ键 + 2个正交π键)',
    dipoleMoment: '0.00 D',
    bondAngleSummary: 'N≡N 叁键 (键长 1.098 Å，键能 945 kJ/mol)',
    description:
      '大气中体积分数占比 78% 的高稳定性双原子分子，含氮有机化合物完全燃烧氧化时氮元素回归热力学最稳定的 N₂ 单质形态。',
    atoms: [
      { id: 0, element: 'N', x: -0.549, y: 0, z: 0 },
      { id: 1, element: 'N', x: 0.549, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order: 'triple' }],
  },
  so2: {
    id: 'prod-so2',
    nameZh: '二氧化硫',
    nameEn: 'Sulfur Dioxide',
    formulaDisplay: 'SO₂',
    category: 'inorganic',
    geometry: 'V形共轭构型',
    symmetry: 'C₂ᵥ 点群',
    hybridization: '硫原子 sp² 杂化 (Π₃⁴ 离域大π键)',
    dipoleMoment: '1.63 D',
    bondAngleSummary: 'O=S=O 119.5°',
    description:
      '含硫化合物燃烧氧化的特征气体产物，中心硫原子保留一对孤对电子呈 119.5° 折线构型。',
    atoms: [
      { id: 0, element: 'S', x: 0, y: 0.36, z: 0 },
      { id: 1, element: 'O', x: 1.24, y: -0.36, z: 0 },
      { id: 2, element: 'O', x: -1.24, y: -0.36, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'double' },
      { from: 0, to: 2, order: 'double' },
    ],
  },
  'salicylic-acid': {
    id: 'prod-salicylic-acid',
    nameZh: '水杨酸 (邻羟基苯甲酸)',
    nameEn: 'Salicylic Acid',
    formulaDisplay: 'C₇H₆O₃',
    category: 'biomed',
    geometry: '邻位分子内氢键螯合平面芳环构型',
    symmetry: 'C_s 点群',
    hybridization: '苯环及羧基碳均为 sp² 杂化',
    dipoleMoment: '2.65 D',
    bondAngleSummary: '芳环 120.0° · 邻位酚羟基与羰基形成六元环分子内氢键',
    description:
      '柳树皮天然镇痛活性成分与阿司匹林酯键水解后的核心母体分子，酚羟基（–OH）可与 Fe³⁺ 发生特征紫色显色反应。',
    atoms: salicylicData.atoms,
    bonds: salicylicData.bonds,
    aromaticRings: [{ center: [0, 0, 0], normal: [0, 0, 1], radius: 0.92 }],
  },
  'diethyl-ether': {
    id: 'prod-diethyl-ether',
    nameZh: '乙醚',
    nameEn: 'Diethyl Ether',
    formulaDisplay: 'C₂H₅OC₂H₅',
    category: 'organic',
    geometry: '折线型醚氧桥连双乙基链',
    symmetry: 'C₂ᵥ (全反式锯齿构象)',
    hybridization: 'C、O 均为 sp³ 杂化',
    dipoleMoment: '1.15 D',
    bondAngleSummary: 'C–O–C 112.0°',
    description:
      '两分子乙醇在浓硫酸催化、140 °C 条件下发生分子间亲核取代脱水生成的经典醚类溶剂（170 °C 则主要发生分子内消去生成乙烯）。',
    atoms: [
      { id: 0, element: 'O', x: 0, y: 0.35, z: 0 },
      { id: 1, element: 'C', x: -1.18, y: -0.42, z: 0 },
      { id: 2, element: 'C', x: -2.41, y: 0.46, z: 0 },
      { id: 3, element: 'C', x: 1.18, y: -0.42, z: 0 },
      { id: 4, element: 'C', x: 2.41, y: 0.46, z: 0 },
      { id: 5, element: 'H', x: -1.19, y: -1.07, z: 0.89 },
      { id: 6, element: 'H', x: -1.19, y: -1.07, z: -0.89 },
      { id: 7, element: 'H', x: -3.32, y: -0.15, z: 0 },
      { id: 8, element: 'H', x: -2.41, y: 1.1, z: 0.89 },
      { id: 9, element: 'H', x: -2.41, y: 1.1, z: -0.89 },
      { id: 10, element: 'H', x: 1.19, y: -1.07, z: 0.89 },
      { id: 11, element: 'H', x: 1.19, y: -1.07, z: -0.89 },
      { id: 12, element: 'H', x: 3.32, y: -0.15, z: 0 },
      { id: 13, element: 'H', x: 2.41, y: 1.1, z: 0.89 },
      { id: 14, element: 'H', x: 2.41, y: 1.1, z: -0.89 },
    ],
    bonds: [
      { from: 0, to: 1, order: 'single' },
      { from: 1, to: 2, order: 'single' },
      { from: 0, to: 3, order: 'single' },
      { from: 3, to: 4, order: 'single' },
      { from: 1, to: 5, order: 'single' },
      { from: 1, to: 6, order: 'single' },
      { from: 2, to: 7, order: 'single' },
      { from: 2, to: 8, order: 'single' },
      { from: 2, to: 9, order: 'single' },
      { from: 3, to: 10, order: 'single' },
      { from: 3, to: 11, order: 'single' },
      { from: 4, to: 12, order: 'single' },
      { from: 4, to: 13, order: 'single' },
      { from: 4, to: 14, order: 'single' },
    ],
  },
};

// ============================================================================
// Stoichiometry & Atom Conservation Utilities
// ============================================================================

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function gcdList(nums: number[]): number {
  return nums.filter((n) => n > 0).reduce((acc, n) => gcd(acc, n), 0) || 1;
}

export function countElementsInMolecule(mol: MoleculeModel): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of mol.atoms) {
    counts[a.element] = (counts[a.element] ?? 0) + 1;
  }
  return counts;
}

export function verifyAtomConservation(
  reactants: ReactionSpeciesTerm[],
  products: ReactionSpeciesTerm[]
): { rows: AtomConservationRow[]; allBalanced: boolean } {
  const rMap = new Map<string, number>();
  const pMap = new Map<string, number>();

  for (const term of reactants) {
    for (const atom of term.molecule.atoms) {
      rMap.set(atom.element, (rMap.get(atom.element) ?? 0) + term.coefficient);
    }
  }
  for (const term of products) {
    for (const atom of term.molecule.atoms) {
      pMap.set(atom.element, (pMap.get(atom.element) ?? 0) + term.coefficient);
    }
  }

  const allSymbols = Array.from(new Set([...rMap.keys(), ...pMap.keys()])).sort(
    (a, b) => {
      const rank = (s: string) => (s === 'C' ? 0 : s === 'H' ? 1 : s === 'O' ? 2 : 3);
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.localeCompare(b);
    }
  );

  const rows: AtomConservationRow[] = allSymbols.map((element) => {
    const reactantAtoms = rMap.get(element) ?? 0;
    const productAtoms = pMap.get(element) ?? 0;
    return {
      element,
      reactantAtoms,
      productAtoms,
      balanced: reactantAtoms === productAtoms,
    };
  });

  return {
    rows,
    allBalanced: rows.every((r) => r.balanced),
  };
}

function formatTerm(term: ReactionSpeciesTerm): string {
  const coeff = term.coefficient > 1 ? String(term.coefficient) : '';
  const phase = term.phaseTag ?? '';
  return `${coeff}${term.molecule.formulaDisplay}${phase}`;
}

function buildEquationString(
  reactants: ReactionSpeciesTerm[],
  products: ReactionSpeciesTerm[],
  reversible: boolean,
  occurs: boolean
): string {
  const lhs = reactants.map(formatTerm).join(' + ');
  if (!occurs) {
    return `${lhs} ↛ 无显著共价化学反应`;
  }
  const arrow = reversible ? '⇌' : '→';
  const rhs = products.map(formatTerm).join(' + ');
  return `${lhs} ${arrow} ${rhs}`;
}

function finalizeReaction(
  spec: Omit<
    ReactionSimulationResult,
    'equationText' | 'atomBalance' | 'isAtomBalanced'
  >
): ReactionSimulationResult {
  const { rows, allBalanced } = verifyAtomConservation(
    spec.reactants,
    spec.products
  );
  return {
    ...spec,
    equationText: buildEquationString(
      spec.reactants,
      spec.products,
      spec.reversible,
      spec.occurs
    ),
    atomBalance: rows,
    isAtomBalanced: allBalanced,
  };
}

// ============================================================================
// Curated Canonical Reactions Database
// ============================================================================

interface CanonicalRule {
  id: string;
  keyA: string;
  keyB: string;
  coeffA: number;
  coeffB: number;
  phaseA?: '(g)' | '(l)' | '(s)' | '(aq)';
  phaseB?: '(g)' | '(l)' | '(s)' | '(aq)';
  reversible: boolean;
  reactionType: string;
  condition: string;
  enthalpyKjPerMol: number;
  activationEnergyKj: number;
  products: () => ReactionSpeciesTerm[];
  bondsBroken: string;
  bondsFormed: string;
  mechanismSummary: string;
  phenomenonNote: string;
}

const CANONICAL_RULES: CanonicalRule[] = [
  {
    id: 'rxn-methane-o2',
    keyA: 'methane',
    keyB: 'oxygen',
    coeffA: 1,
    coeffB: 2,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '完全燃烧氧化反应',
    condition: '点燃',
    enthalpyKjPerMol: -890.3,
    activationEnergyKj: 150,
    products: () => [
      { coefficient: 1, molecule: MOLECULE_BY_ID['co2'], roleLabel: '温室碳氧化物', phaseTag: '(g)' },
      { coefficient: 2, molecule: MOLECULE_BY_ID['water'], roleLabel: '燃烧水蒸气', phaseTag: '(l)' },
    ],
    bondsBroken: '断裂 4 根 C–H σ 单键与 2 根 O=O 双键',
    bondsFormed: '形成 2 根高键能 C=O 双键（CO₂）与 4 根 O–H 单键（H₂O）',
    mechanismSummary:
      '高温点火引发甲基自由基（·CH₃）与氧双自由基链式支链反应，碳原子由 -4 价彻底氧化至最高 +4 价（sp 直线型 CO₂），释放高达 890.3 kJ/mol 的热能。',
    phenomenonNote:
      '产生明亮的淡蓝色火焰并释放大量热量，干燥冷烧杯内壁凝结水雾，导出气体可使澄清石灰水变浑浊。',
  },
  {
    id: 'rxn-h2-o2',
    keyA: 'hydrogen',
    keyB: 'oxygen',
    coeffA: 2,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '化合与清洁燃烧反应',
    condition: '点燃 / 铂催化',
    enthalpyKjPerMol: -571.6,
    activationEnergyKj: 115,
    products: () => [
      { coefficient: 2, molecule: MOLECULE_BY_ID['water'], roleLabel: '唯一零碳产物', phaseTag: '(l)' },
    ],
    bondsBroken: '断裂 2 根 H–H σ 键与 1 根 O=O 双键',
    bondsFormed: '形成 4 根强极性 O–H 共价单键',
    mechanismSummary:
      '氢自由基（·H）与羟基自由基（·OH）高速链式传递，新成键总键能远大于旧键断裂吸收的能量，是氢氧燃料电池与液氢火箭发动机的核心能量来源。',
    phenomenonNote:
      '纯净氢气安静燃烧呈淡蓝色火焰；若处于爆炸极限混合体积比，点燃瞬间发生爆鸣并生成纯水。',
  },
  {
    id: 'rxn-acetylene-o2',
    keyA: 'acetylene',
    keyB: 'oxygen',
    coeffA: 2,
    coeffB: 5,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '高能完全燃烧氧化反应',
    condition: '纯氧助燃点燃 (氧炔焰)',
    enthalpyKjPerMol: -2599.2,
    activationEnergyKj: 125,
    products: () => [
      { coefficient: 4, molecule: MOLECULE_BY_ID['co2'], roleLabel: '完全氧化产物', phaseTag: '(g)' },
      { coefficient: 2, molecule: MOLECULE_BY_ID['water'], roleLabel: '副产物水', phaseTag: '(g)' },
    ],
    bondsBroken: '断裂 C≡C 叁键、C–H 单键及 O=O 双键',
    bondsFormed: '形成 8 根高稳定性 C=O 双键与 4 根 O–H 单键',
    mechanismSummary:
      '乙炔含碳量高达 92.3% 且具有正生成焓（贮存化学能高），纯氧助燃时完全转化为 CO₂ 与水蒸气，火焰核心温度高达 3100–3300 °C，足以熔化切割钢铁。',
    phenomenonNote:
      '空气中燃烧因含碳量极高而冒浓烈黑烟；在纯氧焊炬中则呈现刺眼白光超高温火焰。',
  },
  {
    id: 'rxn-ethanol-o2',
    keyA: 'ethanol',
    keyB: 'oxygen',
    coeffA: 1,
    coeffB: 3,
    phaseA: '(l)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '生物醇完全燃烧氧化反应',
    condition: '点燃',
    enthalpyKjPerMol: -1366.8,
    activationEnergyKj: 135,
    products: () => [
      { coefficient: 2, molecule: MOLECULE_BY_ID['co2'], roleLabel: '氧化碳产物', phaseTag: '(g)' },
      { coefficient: 3, molecule: MOLECULE_BY_ID['water'], roleLabel: '水', phaseTag: '(l)' },
    ],
    bondsBroken: '断裂 C–C、C–H、C–O、O–H 键与 3 根 O=O 双键',
    bondsFormed: '形成 4 根 C=O 双键与 6 根 O–H 单键',
    mechanismSummary:
      '乙醇分子自带一个氧原子，燃烧需氧量低于同碳数烷烃，燃烧充分且不易产生碳黑颗粒，广泛用作实验室酒精灯与生物质清洁乙醇汽油燃料。',
    phenomenonNote: '液体表面形成柔和稳定的淡蓝色火焰，无黑烟，放出显著热量。',
  },
  {
    id: 'rxn-benzene-o2',
    keyA: 'benzene',
    keyB: 'oxygen',
    coeffA: 2,
    coeffB: 15,
    phaseA: '(l)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '芳香烃完全燃烧反应',
    condition: '足量氧气点燃',
    enthalpyKjPerMol: -6535.0,
    activationEnergyKj: 165,
    products: () => [
      { coefficient: 12, molecule: MOLECULE_BY_ID['co2'], roleLabel: '二氧化碳', phaseTag: '(g)' },
      { coefficient: 6, molecule: MOLECULE_BY_ID['water'], roleLabel: '水', phaseTag: '(l)' },
    ],
    bondsBroken: '破坏苯环离域 Π₆⁶ 大π键、C–C σ 骨架、C–H 键及 O=O 键',
    bondsFormed: '形成 24 根 C=O 双键与 12 根 O–H 单键',
    mechanismSummary:
      '苯分子碳氢原子比高达 1:1（与乙炔相同），需高化学计量比氧气才能将稳定芳环彻底氧化裂解为 CO₂ 与 H₂O。',
    phenomenonNote:
      '常规空气中因供氧扩散受限呈明亮火焰并伴随浓重碳黑烟尘；纯氧足量时完全转化为无色气体与水。',
  },
  {
    id: 'rxn-esterification',
    keyA: 'acetic-acid',
    keyB: 'ethanol',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(l)',
    phaseB: '(l)',
    reversible: true,
    reactionType: '费歇尔可逆酯化反应 (亲核酰基取代)',
    condition: '浓 H₂SO₄ 催化 · Δ 加热回流',
    enthalpyKjPerMol: -3.8,
    activationEnergyKj: 78,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['ethyl-acetate'], roleLabel: '果香酯类主产物', phaseTag: '(l)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['water'], roleLabel: '缩合副产物水', phaseTag: '(l)' },
    ],
    bondsBroken: '羧酸分子断裂酰氧 C–OH 键，醇分子断裂羟基 O–H 键（“酸脱羟基、醇脱氢”）',
    bondsFormed: '形成酯基 C–O–C 键（乙酸乙酯）与 O–H 键（水）',
    mechanismSummary:
      '¹⁸O 同位素示踪实验证实：质子化活化乙酸羰基碳后，乙醇氧原子孤对电子亲核进攻形成四面体中间体，随后质子转移消除一分子 H₂O 生成乙酸乙酯。',
    phenomenonNote:
      '饱和碳酸钠接收液液面上析出一层透明油状液体，散发浓郁清甜的水果香味。',
  },
  {
    id: 'rxn-hcl-naoh',
    keyA: 'hcl',
    keyB: 'naoh',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(aq)',
    phaseB: '(aq)',
    reversible: false,
    reactionType: '强酸强碱酸碱中和反应',
    condition: '水溶液常温瞬时反应',
    enthalpyKjPerMol: -57.3,
    activationEnergyKj: 14,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['nacl-pair'], roleLabel: '中性强电解质盐', phaseTag: '(aq)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['water'], roleLabel: '弱电解质水', phaseTag: '(l)' },
    ],
    bondsBroken: 'HCl 极性共价键异裂电离 H⁺，NaOH 离子配位解离 OH⁻',
    bondsFormed: 'H⁺ 与 OH⁻ 结合形成高稳定性水分子 O–H 共价键',
    mechanismSummary:
      '强酸强碱稀溶液中和的本质是 H⁺(aq) + OH⁻(aq) → H₂O(l)，质子沿氢键网络以格罗特斯（Grotthuss）跳跃机制在皮秒级完成传递，恒定释放 57.3 kJ/mol 中和热。',
    phenomenonNote:
      '溶液温度明显上升，若预先滴加酚酞指示剂，溶液在计量点由粉红色瞬间褪为无色中性。',
  },
  {
    id: 'rxn-h2so4-naoh',
    keyA: 'sulfuric-acid',
    keyB: 'naoh',
    coeffA: 1,
    coeffB: 2,
    phaseA: '(aq)',
    phaseB: '(aq)',
    reversible: false,
    reactionType: '二元强酸完全中和反应',
    condition: '水溶液常温反应',
    enthalpyKjPerMol: -114.6,
    activationEnergyKj: 15,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['sodium-sulfate'], roleLabel: '正盐产物', phaseTag: '(aq)' },
      { coefficient: 2, molecule: MOLECULE_BY_ID['water'], roleLabel: '中和水', phaseTag: '(l)' },
    ],
    bondsBroken: '硫酸两级电离断裂 2 根 O–H 键，2 分子 NaOH 解离',
    bondsFormed: '生成 2 分子 H₂O 的 O–H 键及硫酸钠离子配位',
    mechanismSummary:
      '1 摩尔二元强酸 H₂SO₄ 提供 2 摩尔 H⁺，与 2 摩尔 OH⁻ 定量结合生成 2 摩尔水，放出的中和热恰好为单质子强酸中和热的两倍（114.6 kJ/mol）。',
    phenomenonNote: '无色透明溶液显著放热升温，蒸发浓缩冷却后可析出十水合硫酸钠（芒硝）晶体。',
  },
  {
    id: 'rxn-acetic-naoh',
    keyA: 'acetic-acid',
    keyB: 'naoh',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(aq)',
    phaseB: '(aq)',
    reversible: false,
    reactionType: '弱酸强碱中和反应',
    condition: '常温水溶液',
    enthalpyKjPerMol: -55.8,
    activationEnergyKj: 18,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['sodium-acetate'], roleLabel: '强碱弱酸盐', phaseTag: '(aq)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['water'], roleLabel: '水', phaseTag: '(l)' },
    ],
    bondsBroken: '乙酸羧基 O–H 键电离断裂，NaOH 解离',
    bondsFormed: '生成 H₂O 共价键与共振稳定的 CH₃COO⁻Na⁺',
    mechanismSummary:
      'OH⁻ 夺取乙酸羧基质子推动弱酸电离平衡彻底右移；由于弱酸电离过程微弱吸热，实测中和热（55.8 kJ/mol）略低于强酸中和热（57.3 kJ/mol）。',
    phenomenonNote: '食醋刺激性酸味消失，反应放热，所得乙酸钠水溶液因羧酸根微弱水解呈弱碱性（pH ≈ 8.9）。',
  },
  {
    id: 'rxn-co2-naoh',
    keyA: 'co2',
    keyB: 'naoh',
    coeffA: 1,
    coeffB: 2,
    phaseA: '(g)',
    phaseB: '(aq)',
    reversible: false,
    reactionType: '酸性氧化物碱液捕集反应',
    condition: '常温气液接触吸收',
    enthalpyKjPerMol: -109.4,
    activationEnergyKj: 32,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['sodium-carbonate'], roleLabel: '纯碱碳酸盐', phaseTag: '(aq)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['water'], roleLabel: '水', phaseTag: '(l)' },
    ],
    bondsBroken: 'CO₂ 中一根 π 键受 OH⁻ 亲核加成打开，随后去质子化',
    bondsFormed: '形成对称离域 CO₃²⁻ 平面碳酸根与 H₂O',
    mechanismSummary:
      '强亲核试剂 OH⁻ 直接进攻 CO₂ 中高度缺电子的 sp 中心碳原子（δ⁺）生成 HCO₃⁻，碱过量时进一步去质子化转化为平面正三角形 CO₃²⁻，是工业碳捕集（CCUS）的经典路径。',
    phenomenonNote: '二氧化碳气体被氢氧化钠溶液迅速吸收导致密闭体系气压显著下降（可引发喷泉实验）。',
  },
  {
    id: 'rxn-co2-water',
    keyA: 'co2',
    keyB: 'water',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(l)',
    reversible: true,
    reactionType: '酸性氧化物可逆水合反应',
    condition: '常温溶解水合 (受压促溶)',
    enthalpyKjPerMol: -20.4,
    activationEnergyKj: 64,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['carbonic-acid'], roleLabel: '二元弱酸碳酸', phaseTag: '(aq)' },
    ],
    bondsBroken: '水分子 O–H 键与 CO₂ 中一根 C=O π 键协同重排',
    bondsFormed: '形成新的 C–OH 单键，碳原子由 sp 杂化转变为 sp² 平面构型',
    mechanismSummary:
      '水分子氧孤对电子作为弱亲核试剂进攻 CO₂ 中心碳原子建立动态可逆平衡（在生物体内由含锌碳酸酐酶催化可将反应速率提升百万倍）。',
    phenomenonNote: '气体部分溶解形成微酸性碳酸饮料体系（pH ≈ 5.6），可使紫色石蕊试液变红，受热又重新逸出气泡。',
  },
  {
    id: 'rxn-nh3-hcl',
    keyA: 'ammonia',
    keyB: 'hcl',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '布朗斯特酸碱质子转移化合反应',
    condition: '常温气相接触瞬时化合',
    enthalpyKjPerMol: -176.0,
    activationEnergyKj: 8,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['ammonium-chloride'], roleLabel: '白色烟雾微晶', phaseTag: '(s)' },
    ],
    bondsBroken: 'HCl 极性 H–Cl 共价单键异裂',
    bondsFormed: 'N 孤对电子与 H⁺ 形成 N→H 配位共价键，并与 Cl⁻ 形成离子键',
    mechanismSummary:
      '路易斯碱/布朗斯特碱 NH₃ 顶端的 sp³ 孤对电子直接捕获 HCl 转移的质子生成正四面体铵根离子（NH₄⁺），气相反应几乎无活化能垒，属扩散控制瞬时反应。',
    phenomenonNote: '两股无色刺激性气体相遇瞬间腾起浓密的白色氯化铵固体烟雾（经典“空瓶生烟”实验）。',
  },
  {
    id: 'rxn-nh3-co2',
    keyA: 'ammonia',
    keyB: 'co2',
    coeffA: 2,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: true,
    reactionType: '工业合成尿素缩合反应 (Bosch–Meiser 工艺)',
    condition: '180–200 °C · 18 MPa 高压',
    enthalpyKjPerMol: -103.7,
    activationEnergyKj: 92,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['urea'], roleLabel: '高氮有机化肥', phaseTag: '(s)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['water'], roleLabel: '脱水副产物', phaseTag: '(g)' },
    ],
    bondsBroken: '断裂 N–H 键与 CO₂ 的一根 C–O 键',
    bondsFormed: '形成两根酰胺 C–N 共价键与水分子 O–H 键',
    mechanismSummary:
      '两分子 NH₃ 与 CO₂ 先快速放热亲核加成生成氨基甲酸铵（NH₂COONH₄）中间体，随后在高温高压下吸热分子内脱水转化为平面共轭尿素分子。',
    phenomenonNote: '高压合成塔中气态无机原料直接转化为白色晶体有机氮肥尿素。',
  },
  {
    id: 'rxn-nh3-water',
    keyA: 'ammonia',
    keyB: 'water',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(l)',
    reversible: true,
    reactionType: '氢键缔合与弱碱电离平衡',
    condition: '常温极速溶解',
    enthalpyKjPerMol: -35.0,
    activationEnergyKj: 16,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['ammonia-hydrate'], roleLabel: '氢键水合物', phaseTag: '(aq)' },
    ],
    bondsBroken: '部分水分子 O–H 键弱化极化',
    bondsFormed: '形成强分子间 O–H···N 氢键桥（并建立 NH₄⁺ + OH⁻ 电离平衡）',
    mechanismSummary:
      '1 体积水在常温下可溶解约 700 体积氨气，主要以 O–H···N 氢键缔合的一水合氨形式存在，约 1% 发生质子转移电离释放 OH⁻（Kb = 1.8×10⁻⁵）。',
    phenomenonNote: '氨气极速溶于水产生极大负压，可引发壮观的红色酚酞氨水喷泉实验。',
  },
  {
    id: 'rxn-acetylene-h2',
    keyA: 'acetylene',
    keyB: 'hydrogen',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '炔烃选择性催化加氢加成反应',
    condition: 'Lindlar 催化剂 (Pd/CaCO₃)',
    enthalpyKjPerMol: -174.4,
    activationEnergyKj: 58,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['ethylene'], roleLabel: '顺式加成烯烃产物', phaseTag: '(g)' },
    ],
    bondsBroken: '乙炔 C≡C 叁键中一根较弱 π 键打开，同时 H–H σ 键在钯表面解离',
    bondsFormed: '形成两根新的 C–H σ 共价单键，碳杂化由 sp 变为 sp²',
    mechanismSummary:
      '氢气吸附在毒化钝化的林德拉（Lindlar）钯催化剂晶面解离为活性氢原子，从炔键同一侧顺式转移加成，精准停留在乙烯阶段而不深度还原为乙烷。',
    phenomenonNote: '气体总物质的量减半，体系放热，产物仍能使溴的四氯化碳溶液褪色。',
  },
  {
    id: 'rxn-acetylene-water',
    keyA: 'acetylene',
    keyB: 'water',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(l)',
    reversible: false,
    reactionType: '炔烃亲电水合与烯醇互变异构反应',
    condition: 'HgSO₄ / 稀 H₂SO₄ 催化 · 75 °C',
    enthalpyKjPerMol: -138.5,
    activationEnergyKj: 68,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['acetaldehyde'], roleLabel: '互变异构醛产物', phaseTag: '(l)' },
    ],
    bondsBroken: 'C≡C 叁键打开两根 π 键，水分子 O–H 键断裂',
    bondsFormed: '先形成不稳定的乙烯醇（CH₂=CHOH），随即质子迁移重排形成高键能 C=O 双键与甲基 C–H 键',
    mechanismSummary:
      '水分子加成到叁键后首先生成热力学不稳定的烯醇式中间体（CH₂=CH–OH），由于 C=O 双键键能显著高于 C=C 双键，迅速发生酮-烯醇互变异构定量转化为乙醛。',
    phenomenonNote: '生成具有辛辣刺激性气味、可发生银镜反应的乙醛液体。',
  },
  {
    id: 'rxn-acetylene-hcl',
    keyA: 'acetylene',
    keyB: 'hcl',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '炔烃亲电加成反应 (PVC 单体合成)',
    condition: '金基无汞催化剂 · 140 °C',
    enthalpyKjPerMol: -108.0,
    activationEnergyKj: 65,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['vinyl-chloride'], roleLabel: 'PVC 高分子单体', phaseTag: '(g)' },
    ],
    bondsBroken: '乙炔一根 C–C π 键与 H–Cl 单键断裂',
    bondsFormed: '形成一根 sp² C–H 单键与一根 C–Cl 单键',
    mechanismSummary:
      'H⁺ 亲电进攻富电子炔键 π 云，Cl⁻ 随后从反侧进攻形成氯乙烯分子，由于氯原子的吸电子诱导效应降低了双键电子云密度，反应易停留在单加成阶段。',
    phenomenonNote: '无色混合气体体积减半并放热，生成微甜气味的氯乙烯气体单体。',
  },
  {
    id: 'rxn-acetylene-cl2',
    keyA: 'acetylene',
    keyB: 'chlorine',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '炔烃卤素反式亲电加成反应',
    condition: 'CCl₄ 溶剂 / 室温避光控制计量',
    enthalpyKjPerMol: -168.0,
    activationEnergyKj: 48,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['dichloroethene'], roleLabel: '反式加成产物', phaseTag: '(l)' },
    ],
    bondsBroken: '乙炔一根 π 键与 Cl–Cl 单键断裂',
    bondsFormed: '在两个碳原子反侧各形成一根 C–Cl 单键',
    mechanismSummary:
      '氯分子受炔键 π 电子极化形成环氯鎓离子桥中间体，第二个 Cl⁻ 从背面反式开环进攻，立体专一性地生成反-1,2-二氯乙烯（氯气过量则继续加成生成四氯乙烷）。',
    phenomenonNote: '氯气的黄绿色迅速褪去，生成无色油状液体。',
  },
  {
    id: 'rxn-benzene-h2',
    keyA: 'benzene',
    keyB: 'hydrogen',
    coeffA: 1,
    coeffB: 3,
    phaseA: '(l)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '芳香环完全催化加氢还原反应',
    condition: '雷尼镍 (Raney Ni) 催化 · 180 °C · 高压',
    enthalpyKjPerMol: -208.4,
    activationEnergyKj: 98,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['cyclohexane'], roleLabel: '椅式脂环烃产物', phaseTag: '(l)' },
    ],
    bondsBroken: '克服 150 kJ/mol 芳香共振能破坏苯环离域 Π₆⁶ 大π键，断裂 3 根 H–H 键',
    bondsFormed: '新形成 6 根 C–H σ 单键，六个碳由平面 sp² 翻折为三维椅式 sp³',
    mechanismSummary:
      '由于苯环具有显著的离域芳香稳定性，第一分子 H₂ 加成需跨越高能垒；一旦大π键被打破生成环己二烯中间体，后续两分子 H₂ 会极快连续加成直达热力学稳定的椅式环己烷。',
    phenomenonNote: '高压反应釜内氢气压力持续下降，平面芳香苯定量转化为无角张力椅式环己烷液体。',
  },
  {
    id: 'rxn-benzene-cl2',
    keyA: 'benzene',
    keyB: 'chlorine',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(l)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '芳香亲电取代反应 (S_EAr)',
    condition: '无水 FeCl₃ 路易斯酸催化',
    enthalpyKjPerMol: -131.5,
    activationEnergyKj: 72,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['chlorobenzene'], roleLabel: '芳基卤代主产物', phaseTag: '(l)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['hcl'], roleLabel: '取代脱出副产物', phaseTag: '(g)' },
    ],
    bondsBroken: '断裂 Cl–Cl 单键与苯环上一根 C–H 键（保留芳香大π键！）',
    bondsFormed: '形成芳基 C–Cl 键与 H–Cl 键',
    mechanismSummary:
      'FeCl₃ 极化 Cl₂ 产生强亲电试剂 Cl⁺ 进攻苯环形成威兰德（Wheland）σ-络合物碳正离子中间体，随后脱去 H⁺ 恢复低能量的 Π₆⁶ 芳香共轭体系（因此发生取代而非加成）。',
    phenomenonNote: '液体微沸，逸出遇湿润空气产生白雾的氯化氢气体，水洗后底层沉降无色油状氯苯。',
  },
  {
    id: 'rxn-methane-cl2',
    keyA: 'methane',
    keyB: 'chlorine',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '自由基链式卤代取代反应',
    condition: '漫射紫外光照 (hν) 或 400 °C',
    enthalpyKjPerMol: -99.5,
    activationEnergyKj: 84,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['chloromethane'], roleLabel: '一氯取代主产物', phaseTag: '(g)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['hcl'], roleLabel: '卤化氢副产物', phaseTag: '(g)' },
    ],
    bondsBroken: '紫外光子均裂 Cl–Cl 键（243 kJ/mol），夺氢断裂甲烷一根 C–H 键',
    bondsFormed: '形成 C–Cl 共价键与高键能 H–Cl 键（431 kJ/mol）',
    mechanismSummary:
      '经历链引发（Cl₂ → 2Cl·）、链传递（Cl· + CH₄ → HCl + ·CH₃；·CH₃ + Cl₂ → CH₃Cl + Cl·）与链终止三步自由基机理（持续光照会进一步多步取代生成 CH₂Cl₂、CHCl₃ 与 CCl₄）。',
    phenomenonNote: '混合气体黄绿色逐渐变浅，试管内壁出现油状多氯代液滴，水槽液面上升。',
  },
  {
    id: 'rxn-steam-methane-reforming',
    keyA: 'methane',
    keyB: 'water',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: true,
    reactionType: '工业水蒸气催化重整制氢反应',
    condition: 'Ni 镍基催化剂 · 850 °C 高温吸热',
    enthalpyKjPerMol: 206.1,
    activationEnergyKj: 240,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['co'], roleLabel: '合成气一氧化碳', phaseTag: '(g)' },
      { coefficient: 3, molecule: MOLECULE_BY_ID['hydrogen'], roleLabel: '工业高纯氢气', phaseTag: '(g)' },
    ],
    bondsBroken: '常温下疏水惰性；850 °C 镍表面活化裂解 4 根 C–H 键与 2 根 O–H 键',
    bondsFormed: '形成 1 根极高键能 C≡O 叁键与 3 根 H–H 单键',
    mechanismSummary:
      '常温下甲烷极难溶于水且不发生化学反应；但在工业 850 °C 高温与镍催化剂作用下发生强吸热重整（ΔH = +206.1 kJ/mol），是目前全球工业制氢（约占总产量 75%）的主力工艺。',
    phenomenonNote: '高温催化床层持续吸热，1 体积甲烷与 1 体积水蒸气膨胀转化为 4 体积合成气（CO + 3H₂）。',
  },
  {
    id: 'rxn-sabatier',
    keyA: 'co2',
    keyB: 'hydrogen',
    coeffA: 1,
    coeffB: 4,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: true,
    reactionType: '萨巴蒂尔 CO₂ 催化加氢甲烷化反应',
    condition: 'Ru / Ni 催化 · 350 °C',
    enthalpyKjPerMol: -165.0,
    activationEnergyKj: 105,
    products: () => [
      { coefficient: 1, molecule: MOLECULE_BY_ID['methane'], roleLabel: '再生合成天然气', phaseTag: '(g)' },
      { coefficient: 2, molecule: MOLECULE_BY_ID['water'], roleLabel: '副产物水', phaseTag: '(g)' },
    ],
    bondsBroken: '断裂 CO₂ 的两根 C=O 双键与 4 根 H–H 键',
    bondsFormed: '形成甲烷 4 根 C–H 键与 2 分子水的 4 根 O–H 键',
    mechanismSummary:
      '碳原子从 +4 价经 8 电子深度加氢还原至 -4 价。该反应既是绿氢转化二氧化碳储能（Power-to-Gas）的关键路径，也是国际空间站（ISS）回收宇航员呼出 CO₂ 再生水资源的真实生命保障反应。',
    phenomenonNote: '气体总物质的量由 5 摩尔收缩为 3 摩尔，反应器显著放热并冷凝出水。',
  },
  {
    id: 'rxn-h2-cl2',
    keyA: 'hydrogen',
    keyB: 'chlorine',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(g)',
    reversible: false,
    reactionType: '自由基链式化合反应',
    condition: '强光照射 (hν) 或点燃',
    enthalpyKjPerMol: -184.6,
    activationEnergyKj: 62,
    products: () => [
      { coefficient: 2, molecule: MOLECULE_BY_ID['hcl'], roleLabel: '氯化氢气体', phaseTag: '(g)' },
    ],
    bondsBroken: '断裂 1 根 H–H 键（436 kJ/mol）与 1 根 Cl–Cl 键（243 kJ/mol）',
    bondsFormed: '形成 2 根强极性 H–Cl 共价单键（2 × 431 kJ/mol）',
    mechanismSummary:
      '蓝紫光光量子即可打断弱 Cl–Cl 键引发量子产率高达 10⁵ 的自由基链式爆炸反应，工业上则在合成炉中安静点燃制取高纯盐酸。',
    phenomenonNote: '纯净氢气在氯气中安静燃烧发出苍白色火焰，瓶口接触空气水汽形成大量盐酸酸雾。',
  },
  {
    id: 'rxn-cl2-water',
    keyA: 'chlorine',
    keyB: 'water',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(g)',
    phaseB: '(l)',
    reversible: true,
    reactionType: '卤素自身氧化还原（歧化）反应',
    condition: '常温避光溶解',
    enthalpyKjPerMol: -25.4,
    activationEnergyKj: 45,
    products: () => [
      { coefficient: 1, molecule: MOLECULE_BY_ID['hcl'], roleLabel: '-1价还原产物', phaseTag: '(aq)' },
      { coefficient: 1, molecule: PRODUCT_MOLECULES['hclo'], roleLabel: '+1价强氧化杀菌酸', phaseTag: '(aq)' },
    ],
    bondsBroken: 'Cl–Cl 非极性键在水分子亲核诱导下异裂，水断裂一根 O–H 键',
    bondsFormed: '形成 H–Cl 与次氯酸 H–O–Cl',
    mechanismSummary:
      '0 价氯元素发生分子内/分子间歧化：一个氯原子得电子降为 -1 价（Cl⁻），另一个氯原子失电子升为 +1 价（HClO），赋予新制氯水强杀菌漂白活性。',
    phenomenonNote: '溶液呈浅黄绿色（新制氯水），滴在有色布条或蓝色石蕊试纸上先变红后迅速褪为白色。',
  },
  {
    id: 'rxn-aspirin-hydrolysis',
    keyA: 'aspirin',
    keyB: 'water',
    coeffA: 1,
    coeffB: 1,
    phaseA: '(s)',
    phaseB: '(l)',
    reversible: true,
    reactionType: '酚酯键水解反应',
    condition: '稀酸或弱碱催化 · 受潮微热',
    enthalpyKjPerMol: 12.4,
    activationEnergyKj: 76,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['salicylic-acid'], roleLabel: '母体水杨酸', phaseTag: '(s)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['acetic-acid'], roleLabel: '水解脱出乙酸', phaseTag: '(l)' },
    ],
    bondsBroken: '阿司匹林乙酰氧基酯键 C(=O)–O 断裂，水分子 O–H 键断裂',
    bondsFormed: '恢复水杨酸酚羟基（Ar–OH）并形成乙酸羧基（CH₃COOH）',
    mechanismSummary:
      '酚酯比普通醇酯更易发生亲核酰基取代水解（水杨酸根是良好的离去基团），因此阿司匹林片剂若受潮保存会缓慢水解释放游离水杨酸与醋酸。',
    phenomenonNote: '受潮变质的阿司匹林药片可闻到明显的醋酸酸味，且加入 FeCl₃ 溶液立即显紫罗兰色。',
  },
  {
    id: 'rxn-acetylene-trimer',
    keyA: 'acetylene',
    keyB: 'acetylene',
    coeffA: 3,
    coeffB: 0, // Special self-reaction handling -> combined 3 C2H2
    phaseA: '(g)',
    reversible: false,
    reactionType: '炔烃 [2+2+2] 环三聚芳构化反应',
    condition: '铁系或活性炭催化剂 · 500–600 °C',
    enthalpyKjPerMol: -596.7,
    activationEnergyKj: 130,
    products: () => [
      { coefficient: 1, molecule: MOLECULE_BY_ID['benzene'], roleLabel: '离域芳香环产物', phaseTag: '(l)' },
    ],
    bondsBroken: '3 分子乙炔的 C≡C 叁键各打开部分 π 键电子云',
    bondsFormed: '首尾协同关环形成 3 根新 C–C σ 键及高度稳定的离域 Π₆⁶ 大π键',
    mechanismSummary:
      '贝特洛（Berthelot）与雷佩（Reppe）经典合成：三分子直线型 sp 乙炔发生周环/金属催化协同环加成，从链状不饱和炔烃一步跨越至芳香族母体苯，释放近 600 kJ/mol 芳构化能。',
    phenomenonNote: '气态乙炔通过灼热催化管后冷凝收集到具有特殊芳香气味的无色折射液体苯。',
  },
  {
    id: 'rxn-ethanol-dimer-ether',
    keyA: 'ethanol',
    keyB: 'ethanol',
    coeffA: 2,
    coeffB: 0,
    phaseA: '(l)',
    reversible: false,
    reactionType: '醇分子间亲核取代脱水反应 (S_N2)',
    condition: '浓 H₂SO₄ 催化 · 精准控温 140 °C',
    enthalpyKjPerMol: -24.1,
    activationEnergyKj: 88,
    products: () => [
      { coefficient: 1, molecule: PRODUCT_MOLECULES['diethyl-ether'], roleLabel: '分子间脱水醚产物', phaseTag: '(l)' },
      { coefficient: 1, molecule: MOLECULE_BY_ID['water'], roleLabel: '缩合水', phaseTag: '(l)' },
    ],
    bondsBroken: '一分子乙醇断裂 C–OH 键，另一分子乙醇断裂 O–H 键',
    bondsFormed: '形成醚氧桥键 C–O–C 与水分子 O–H 键',
    mechanismSummary:
      '浓硫酸质子化一分子乙醇羟基使其变为优良离去基团（–OH₂⁺），另一分子未质子化的乙醇氧原子背面 S_N2 亲核进攻脱去水生成乙醚（温度升至 170 °C 则转为消去生成乙烯）。',
    phenomenonNote: '馏出沸点极低（34.6 °C）、极易挥发且具特殊甜醚气味的无色透明液体。',
  },
];

// ============================================================================
// Tier 2: Universal Chemical Heuristic Engine (Combustion, Hydrogenation, etc.)
// ============================================================================

function tryGeneralCombustion(
  fuel: MoleculeModel,
  oxygenMol: MoleculeModel,
  fuelIsFirst: boolean
): ReactionSimulationResult | null {
  const counts = countElementsInMolecule(fuel);
  const allowed = new Set(['C', 'H', 'O', 'N', 'S']);
  const keys = Object.keys(counts);
  if (!keys.every((k) => allowed.has(k))) return null;

  const c = counts['C'] ?? 0;
  const h = counts['H'] ?? 0;
  const o = counts['O'] ?? 0;
  const n = counts['N'] ?? 0;
  const s = counts['S'] ?? 0;

  // Must contain oxidizable C, H, or S (and not already fully oxidized CO2 / H2O / H2SO4)
  if (c === 0 && h === 0 && s === 0) return null;
  // Exact O atoms required per 1 molecule of fuel: 2*C + 0.5*H + 2*S - O
  // Multiply by 4 to work purely in exact integers:
  // 4 Fuel + (4c + h + 4s - 2o) O2 -> 4c CO2 + 2h H2O + 2n N2 + 4s SO2
  const o2Quad = 4 * c + h + 4 * s - 2 * o;
  if (o2Quad <= 0) return null;

  let kFuel = 4;
  let kO2 = o2Quad;
  let kCO2 = 4 * c;
  let kH2O = 2 * h;
  let kN2 = 2 * n;
  let kSO2 = 4 * s;

  const divisor = gcdList([kFuel, kO2, kCO2, kH2O, kN2, kSO2]);
  kFuel /= divisor;
  kO2 /= divisor;
  kCO2 /= divisor;
  kH2O /= divisor;
  kN2 /= divisor;
  kSO2 /= divisor;

  const fuelTerm: ReactionSpeciesTerm = { coefficient: kFuel, molecule: fuel };
  const o2Term: ReactionSpeciesTerm = {
    coefficient: kO2,
    molecule: oxygenMol,
    phaseTag: '(g)',
  };

  const products: ReactionSpeciesTerm[] = [];
  if (kCO2 > 0) {
    products.push({
      coefficient: kCO2,
      molecule: MOLECULE_BY_ID['co2'],
      roleLabel: '完全氧化碳产物',
      phaseTag: '(g)',
    });
  }
  if (kH2O > 0) {
    products.push({
      coefficient: kH2O,
      molecule: MOLECULE_BY_ID['water'],
      roleLabel: '氧化水产物',
      phaseTag: '(l)',
    });
  }
  if (kN2 > 0) {
    products.push({
      coefficient: kN2,
      molecule: PRODUCT_MOLECULES['n2'],
      roleLabel: '氮元素氧化还原稳态单质',
      phaseTag: '(g)',
    });
  }
  if (kSO2 > 0) {
    products.push({
      coefficient: kSO2,
      molecule: PRODUCT_MOLECULES['so2'],
      roleLabel: '硫氧化物产物',
      phaseTag: '(g)',
    });
  }

  // Empirical Dulong/Thornton combustion heat (~ -418 kJ per mole of O2 consumed)
  const enthalpy = Number((-(kO2 / kFuel) * 418).toFixed(1));

  return finalizeReaction({
    id: `rxn-auto-combustion-${fuel.id}`,
    occurs: true,
    reversible: false,
    reactionType: '有机物/氢化物完全燃烧氧化反应',
    condition: '足量氧气 · 点燃',
    enthalpyKjPerMol: enthalpy,
    activationEnergyKj: 145,
    reactants: fuelIsFirst ? [fuelTerm, o2Term] : [o2Term, fuelTerm],
    products,
    bondsBroken: `断裂 ${fuel.nameZh} 分子内共价骨架键及 ${kO2} 分子 O=O 双键`,
    bondsFormed:
      '碳、氢元素分别与氧结合生成高键能 C=O 双键（CO₂）与 O–H 单键（H₂O）' +
      (kN2 > 0 ? '，氮元素转化为高稳定性 N≡N 氮气单质' : ''),
    mechanismSummary: `根据元素化学计量与氧化数法则自动配平：${fuel.nameZh}（${fuel.formulaDisplay}）在足量氧气中彻底氧化裂解，各元素全部归于热力学低势能氧化物或稳态双原子分子。`,
    phenomenonNote: '剧烈放热发光燃烧，生成无色气体并冷凝水珠。',
  });
}

function tryGeneralHydrogenation(
  substrate: MoleculeModel,
  h2Mol: MoleculeModel,
  substrateIsFirst: boolean
): ReactionSimulationResult | null {
  // Find a non-ionic multiple bond (C=C, C≡C, C=O, C=N) in substrate (excluding large C60/crystal lattices > 30 atoms)
  if (substrate.atoms.length > 32) return null;
  const targetBond = substrate.bonds.find(
    (b) => b.order === 'triple' || b.order === 'double'
  );
  if (!targetBond) return null;

  // Reduce bond order by 1 step and sprout 1 Hydrogen onto each endpoint atom using VSEPR 3D geometry!
  const nextOrder = targetBond.order === 'triple' ? 'double' : 'single';
  let reduced = connectOrUpdateBond(
    substrate,
    targetBond.from,
    targetBond.to,
    nextOrder
  );
  reduced = addBondedAtomWithVsepr(reduced, targetBond.from, 'H', 'single').molecule;
  reduced = addBondedAtomWithVsepr(reduced, targetBond.to, 'H', 'single').molecule;

  const formula = formatMolecularFormula(reduced.atoms);
  const hydrogenatedProduct: MoleculeModel = {
    ...reduced,
    id: `prod-hydro-${substrate.id}`,
    nameZh: `${substrate.nameZh}加氢产物`,
    nameEn: `Hydrogenated ${substrate.nameEn}`,
    formulaDisplay: formula,
    geometry: '催化加氢还原三维构象',
    hybridization: '不饱和双键/叁键加氢升阶杂化',
    description: `由 ${substrate.nameZh}（${substrate.formulaDisplay}）中的不饱和 π 键经金属催化顺式加氢还原生成的三维分子模型。`,
  };

  const subTerm: ReactionSpeciesTerm = { coefficient: 1, molecule: substrate };
  const h2Term: ReactionSpeciesTerm = {
    coefficient: 1,
    molecule: h2Mol,
    phaseTag: '(g)',
  };

  return finalizeReaction({
    id: `rxn-auto-hydro-${substrate.id}`,
    occurs: true,
    reversible: false,
    reactionType: '不饱和键催化加氢加成反应',
    condition: 'Pd/C 或 Ni 催化剂 · 加热加压',
    enthalpyKjPerMol: -124.0,
    activationEnergyKj: 64,
    reactants: substrateIsFirst ? [subTerm, h2Term] : [h2Term, subTerm],
    products: [
      {
        coefficient: 1,
        molecule: hydrogenatedProduct,
        roleLabel: '催化加氢还原产物',
      },
    ],
    bondsBroken: `打开 ${substrate.nameZh} 中一根不饱和 π 键并解离 H–H σ 单键`,
    bondsFormed: '在不饱和键两端原子上各形成一根新的 σ 氢加成单键',
    mechanismSummary:
      '过渡金属催化剂（Pd、Pt 或 Ni）表面吸附并均裂 H–H 键，活性氢原子向富电子 π 键或不饱和极性双键发生顺式加成，降低分子不饱和度。',
    phenomenonNote: '反应体系吸收氢气压力下降并温和放热，生成饱和度更高的还原产物。',
  });
}

function tryGeneralChlorination(
  substrate: MoleculeModel,
  cl2Mol: MoleculeModel,
  substrateIsFirst: boolean
): ReactionSimulationResult | null {
  if (substrate.atoms.length > 32) return null;
  // Find a C-H bond for free-radical substitution R-H + Cl2 -> R-Cl + HCl
  const atomMap = new Map(substrate.atoms.map((a) => [a.id, a]));
  const chBond = substrate.bonds.find((b) => {
    const a1 = atomMap.get(b.from);
    const a2 = atomMap.get(b.to);
    return (
      b.order === 'single' &&
      ((a1?.element === 'C' && a2?.element === 'H') ||
        (a1?.element === 'H' && a2?.element === 'C'))
    );
  });
  if (!chBond) return null;

  const cId =
    atomMap.get(chBond.from)?.element === 'C' ? chBond.from : chBond.to;
  const hId = cId === chBond.from ? chBond.to : chBond.from;
  const cAtom = atomMap.get(cId)!;
  const hAtom = atomMap.get(hId)!;

  // Elongate C-H vector (~1.09 Å) to C-Cl bond length (~1.77 Å)
  const dx = hAtom.x - cAtom.x;
  const dy = hAtom.y - cAtom.y;
  const dz = hAtom.z - cAtom.z;
  const len = Math.hypot(dx, dy, dz) || 1.09;
  const scale = 1.77 / len;

  const nextAtoms: AtomNode[] = substrate.atoms.map((a) =>
    a.id === hId
      ? {
          ...a,
          element: 'Cl',
          x: Number((cAtom.x + dx * scale).toFixed(4)),
          y: Number((cAtom.y + dy * scale).toFixed(4)),
          z: Number((cAtom.z + dz * scale).toFixed(4)),
        }
      : { ...a }
  );

  const formula = formatMolecularFormula(nextAtoms);
  const chlorinatedMol: MoleculeModel = {
    ...substrate,
    id: `prod-chloro-${substrate.id}`,
    nameZh: `一氯代${substrate.nameZh}`,
    nameEn: `Chlorinated ${substrate.nameEn}`,
    formulaDisplay: formula,
    description: `由 ${substrate.nameZh} 经紫外光照自由基取代一分子氢原子生成的氯代衍生物（同时生成一分子 HCl）。`,
    atoms: nextAtoms,
  };

  const subTerm: ReactionSpeciesTerm = { coefficient: 1, molecule: substrate };
  const cl2Term: ReactionSpeciesTerm = {
    coefficient: 1,
    molecule: cl2Mol,
    phaseTag: '(g)',
  };

  return finalizeReaction({
    id: `rxn-auto-chloro-${substrate.id}`,
    occurs: true,
    reversible: false,
    reactionType: '自由基一氯取代反应',
    condition: '紫外光照 (hν)',
    enthalpyKjPerMol: -102.0,
    activationEnergyKj: 82,
    reactants: substrateIsFirst ? [subTerm, cl2Term] : [cl2Term, subTerm],
    products: [
      { coefficient: 1, molecule: chlorinatedMol, roleLabel: '氯代有机主产物' },
      {
        coefficient: 1,
        molecule: MOLECULE_BY_ID['hcl'],
        roleLabel: '氯化氢副产物',
        phaseTag: '(g)',
      },
    ],
    bondsBroken: `断裂 ${substrate.nameZh} 中一根 C–H 键与 Cl–Cl 单键`,
    bondsFormed: '形成 C–Cl 共价单键（键长 ~1.77 Å）与 H–Cl 单键',
    mechanismSummary:
      '紫外光诱发氯气均裂为氯自由基（Cl·），夺取烃基氢原子生成碳自由基中间体，再与另一分子 Cl₂ 反应实现自由基链式卤代。',
    phenomenonNote: '氯气黄绿色消退，伴随遇湿空气发白雾的氯化氢气体逸出。',
  });
}

function buildPhysicalInteractionFallback(
  molA: MoleculeModel,
  molB: MoleculeModel
): ReactionSimulationResult {
  const sameMol = molA.id === molB.id;
  const countsA = countElementsInMolecule(molA);
  const countsB = countElementsInMolecule(molB);
  const isWaterInvolved = molA.id === 'water' || molB.id === 'water';
  const hasPolarGroup = (c: Record<string, number>) =>
    (c['O'] ?? 0) > 0 || (c['N'] ?? 0) > 0 || (c['Cl'] ?? 0) > 0 || (c['Na'] ?? 0) > 0;

  const polarA = hasPolarGroup(countsA);
  const polarB = hasPolarGroup(countsB);

  let interactionTitle = '物理混合体系 · 无共价断键反应';
  let summary = '';
  let phenomenon = '';

  if (sameMol) {
    interactionTitle = '纯净物同种分子间作用力体系';
    summary = `两份同种 ${molA.nameZh}（${molA.formulaDisplay}）在常规条件下不存在氧化还原电位差或酸碱亲核梯度，不发生化学重排，仅通过分子间范德华力${polarA ? '或偶极/氢键网络' : '（色散力）'}发生聚集。`;
    phenomenon = '保持纯净物原有物理物态与化学性质，无新物质生成。';
  } else if ((molA.id === 'nacl' && molB.id === 'water') || (molB.id === 'nacl' && molA.id === 'water')) {
    interactionTitle = '离子晶体水合解离溶解过程';
    summary =
      '氯化钠岩盐晶格在水分子强极性偶极作用下发生水合解离：水分子的氧端（δ⁻）包围 Na⁺，氢端（δ⁺）包围 Cl⁻，破坏离子晶格形成均一强电解质水溶液（若通直流电电解则可进一步发生氯碱反应生成 NaOH、H₂ 与 Cl₂）。';
    phenomenon = '白色氯化钠晶体逐渐溶解消失，形成无色透明导电食盐水溶液，温度几乎不变（ΔH_sol ≈ +3.9 kJ/mol）。';
  } else if (polarA && polarB) {
    interactionTitle = '极性相似相溶 / 分子间氢键溶剂化';
    summary = `${molA.nameZh} 与 ${molB.nameZh} 在常规条件下缺乏足以跨越活化能垒的断键成键配对（如强酸-强碱或强氧化-还原对），主要通过偶极-偶极相互作用与分子间氢键网络形成均一互溶体系。`;
    phenomenon = '两物种均匀互溶或分散，不产生沉淀、气体或显著化学热效应。';
  } else if (!polarA && !polarB) {
    interactionTitle = '非极性相似相溶（伦敦色散力互溶）';
    summary = `${molA.nameZh} 与 ${molB.nameZh} 均为非极性或弱极性共价分子，饱和键能高且缺乏亲电/亲核反应位点，依靠瞬时偶极诱导的伦敦色散力相互混溶，不发生化学键断裂。`;
    phenomenon = '按“相似相溶”规律相互混溶，无化学发光、变色或气体逸出。';
  } else {
    interactionTitle = `极性差异相分离 · 无显著化学反应`;
    summary = `${molA.nameZh} 与 ${molB.nameZh} 之间既无自发酸碱质子转移，也无常温亲电/自由基反应活性；由于${isWaterInvolved ? '水分子强氢键网络排斥非极性分子（疏水效应）' : '分子极性差异显著'}，体系发生物理分层或微溶。`;
    phenomenon = '静置后呈现界面清晰的液液分层或气液不互溶状态，无新化学物质生成。';
  }

  const reactants: ReactionSpeciesTerm[] = sameMol
    ? [{ coefficient: 2, molecule: molA }]
    : [
        { coefficient: 1, molecule: molA },
        { coefficient: 1, molecule: molB },
      ];

  const products: ReactionSpeciesTerm[] = sameMol
    ? [{ coefficient: 2, molecule: molA, roleLabel: '未反应原分子' }]
    : [
        { coefficient: 1, molecule: molA, roleLabel: '未断键组分 A' },
        { coefficient: 1, molecule: molB, roleLabel: '未断键组分 B' },
      ];

  return finalizeReaction({
    id: `rxn-inert-${molA.id}-${molB.id}`,
    occurs: false,
    reversible: false,
    reactionType: interactionTitle,
    condition: '标准常温常压',
    enthalpyKjPerMol: 0,
    activationEnergyKj: 0,
    reactants,
    products,
    bondsBroken: '无共价化学键断裂',
    bondsFormed: '仅建立分子间非共价相互作用（氢键 / 偶极力 / 范德华色散力）',
    mechanismSummary: summary,
    phenomenonNote: phenomenon,
  });
}

/**
 * Main deterministic chemical reaction simulator.
 * Evaluates canonical inorganic/organic reactions first (preserving user's Slot A + Slot B order),
 * then falls back to stoichiometric/functional-group heuristic rules, and finally honest physical chemistry analysis.
 */
export function simulateChemicalReaction(
  molA: MoleculeModel,
  molB: MoleculeModel
): ReactionSimulationResult {
  // 1. Check curated canonical rules (supports both A + B and B + A, plus curated A + A)
  for (const rule of CANONICAL_RULES) {
    if (rule.coeffB === 0) {
      if (molA.id === rule.keyA && molB.id === rule.keyA) {
        return finalizeReaction({
          id: rule.id,
          occurs: true,
          reversible: rule.reversible,
          reactionType: rule.reactionType,
          condition: rule.condition,
          enthalpyKjPerMol: rule.enthalpyKjPerMol,
          activationEnergyKj: rule.activationEnergyKj,
          reactants: [
            {
              coefficient: rule.coeffA,
              molecule: molA,
              phaseTag: rule.phaseA,
            },
          ],
          products: rule.products(),
          bondsBroken: rule.bondsBroken,
          bondsFormed: rule.bondsFormed,
          mechanismSummary: rule.mechanismSummary,
          phenomenonNote: rule.phenomenonNote,
        });
      }
      continue;
    }

    const forwardMatch = molA.id === rule.keyA && molB.id === rule.keyB;
    const reverseMatch = molA.id === rule.keyB && molB.id === rule.keyA;

    if (forwardMatch || reverseMatch) {
      const reactants: ReactionSpeciesTerm[] = forwardMatch
        ? [
            { coefficient: rule.coeffA, molecule: molA, phaseTag: rule.phaseA },
            { coefficient: rule.coeffB, molecule: molB, phaseTag: rule.phaseB },
          ]
        : [
            { coefficient: rule.coeffB, molecule: molA, phaseTag: rule.phaseB },
            { coefficient: rule.coeffA, molecule: molB, phaseTag: rule.phaseA },
          ];

      return finalizeReaction({
        id: rule.id,
        occurs: true,
        reversible: rule.reversible,
        reactionType: rule.reactionType,
        condition: rule.condition,
        enthalpyKjPerMol: rule.enthalpyKjPerMol,
        activationEnergyKj: rule.activationEnergyKj,
        reactants,
        products: rule.products(),
        bondsBroken: rule.bondsBroken,
        bondsFormed: rule.bondsFormed,
        mechanismSummary: rule.mechanismSummary,
        phenomenonNote: rule.phenomenonNote,
      });
    }
  }

  // 2. General O2 Complete Combustion (works on Caffeine, Aspirin, Diamond, C60, imported Acetone, custom hydrocarbons!)
  if (molB.id === 'oxygen' && molA.id !== 'oxygen') {
    const comb = tryGeneralCombustion(molA, molB, true);
    if (comb) return comb;
  }
  if (molA.id === 'oxygen' && molB.id !== 'oxygen') {
    const comb = tryGeneralCombustion(molB, molA, false);
    if (comb) return comb;
  }

  // 3. General H2 Catalytic Hydrogenation on any unsaturated molecule (e.g. imported Acetone C=O -> Isopropanol, C=C -> C-C)
  if (molB.id === 'hydrogen' && molA.id !== 'hydrogen') {
    const hydro = tryGeneralHydrogenation(molA, molB, true);
    if (hydro) return hydro;
  }
  if (molA.id === 'hydrogen' && molB.id !== 'hydrogen') {
    const hydro = tryGeneralHydrogenation(molB, molA, false);
    if (hydro) return hydro;
  }

  // 4. General Cl2 Free-Radical Chlorination on C-H containing molecules (e.g. Ethanol, Ethane, custom alkanes)
  if (molB.id === 'chlorine' && molA.id !== 'chlorine') {
    const chloro = tryGeneralChlorination(molA, molB, true);
    if (chloro) return chloro;
  }
  if (molA.id === 'chlorine' && molB.id !== 'chlorine') {
    const chloro = tryGeneralChlorination(molB, molA, false);
    if (chloro) return chloro;
  }

  // 5. Honest Physical Chemistry & Intermolecular Force Analysis when no covalent reaction occurs
  return buildPhysicalInteractionFallback(molA, molB);
}
