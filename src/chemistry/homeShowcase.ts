import { ELEMENT_BY_SYMBOL } from './elements';
import { MOLECULE_BY_ID, MoleculeModel } from './molecules';
import { QuantumOrbitalId } from './quantumOrbitals';

// Compatible render style literal for strict UI decoupling
export type ShowcaseRenderStyle = 'ball-stick' | 'space-filling' | 'esp' | 'wireframe';

export type ShowcaseTargetDestination =
  | {
      kind: 'molecule';
      moleculeId: string;
      renderStyle?: ShowcaseRenderStyle;
      showDipoleVector?: boolean;
    }
  | {
      kind: 'atom';
      elementSymbol: string;
      atomViewMode: 'bohr' | 'quantum';
      quantumOrbitalId?: QuantumOrbitalId;
    }
  | {
      kind: 'reaction';
      reactantAId: string;
      reactantBId: string;
      reactionTitle: string;
    };

export type SatelliteVisualKind =
  | {
      type: 'molecule';
      moleculeId: string;
      style: 'cpk' | 'esp';
      showDipole?: boolean;
    }
  | {
      type: 'reaction-pair';
      reactantAId: string;
      reactantBId: string;
    }
  | {
      type: 'bohr-atom';
      elementSymbol: string;
      shellCount: number;
    }
  | {
      type: 'quantum-orbital';
      elementSymbol: string;
      orbitalId: QuantumOrbitalId;
    };

export interface HomeHeroSpec {
  id: string;
  moleculeId: string;
  titleZh: string;
  formula: string;
  subtitle: string;
  summary: string;
}

export interface HomeSatelliteCase {
  id: string;
  index: number;
  titleZh: string;
  formulaOrTag: string;
  categoryLabel: string;
  actionLabel: string;
  description: string;
  accentHex: string;
  visual: SatelliteVisualKind;
  destination: ShowcaseTargetDestination;
}

export interface NormalizedAtomCoord {
  id: number;
  element: string;
  x: number;
  y: number;
  z: number;
}

export const HOME_HERO_MODELS: HomeHeroSpec[] = [
  {
    id: 'hero-c60',
    moleculeId: 'fullerene-c60',
    titleZh: '富勒烯巴基球',
    formula: 'C₆₀',
    subtitle: '60 碳原子 · 90 共价键 · Ih 截角二十面体对称',
    summary:
      '由 12 个五元环与 20 个六元环闭合而成的零维碳纳米笼，点击中心主模型或周边卫星案例即可直达对应三维详情工作台。',
  },
  {
    id: 'hero-caffeine',
    moleculeId: 'caffeine',
    titleZh: '咖啡因分子',
    formula: 'C₈H₁₀N₄O₂',
    subtitle: '24 原子 · 嘌呤生物碱双环共轭骨架',
    summary:
      '平面黄嘌呤杂环耦合三个甲基取代基，直观展现 sp² 杂化芳香环与 sp³ 甲基四面体的立体几何对比。',
  },
  {
    id: 'hero-diamond',
    moleculeId: 'diamond',
    titleZh: '金刚石晶胞',
    formula: 'C (sp³)',
    subtitle: '18 晶格位点 · 109.5° 正四面体共价网络',
    summary:
      '每个碳原子通过四个等长共价单键构建三维无限延伸刚性骨架，成就自然界最高摩氏硬度晶体结构。',
  },
  {
    id: 'hero-aspirin',
    moleculeId: 'aspirin',
    titleZh: '阿司匹林',
    formula: 'C₉H₈O₄',
    subtitle: '21 原子 · 苯环 + 羧基 + 酯基多官能团',
    summary:
      '医药化学史上最具代表性的解热镇痛小分子，同时包含芳香环、羧酸基与可水解乙酰酯键。',
  },
];

export const HOME_SATELLITE_CASES: HomeSatelliteCase[] = [
  {
    id: 'case-caffeine',
    index: 0,
    titleZh: '咖啡因构型',
    formulaOrTag: 'C₈H₁₀N₄O₂',
    categoryLabel: '医药分子',
    actionLabel: '分子模型详情',
    description: '检视黄嘌呤双杂环平面与甲基四面体键角、键长参数',
    accentHex: '#38bdf8',
    visual: { type: 'molecule', moleculeId: 'caffeine', style: 'cpk' },
    destination: {
      kind: 'molecule',
      moleculeId: 'caffeine',
      renderStyle: 'ball-stick',
    },
  },
  {
    id: 'case-water-esp',
    index: 1,
    titleZh: '水分子静电势',
    formulaOrTag: 'H₂O · ESP',
    categoryLabel: '极性与偶极',
    actionLabel: '静电势与偶极详情',
    description: '氧端富电子负电势与氢端正电势分布及 1.85 D 合偶极矩矢量',
    accentHex: '#60a5fa',
    visual: {
      type: 'molecule',
      moleculeId: 'water',
      style: 'esp',
      showDipole: true,
    },
    destination: {
      kind: 'molecule',
      moleculeId: 'water',
      renderStyle: 'esp',
      showDipoleVector: true,
    },
  },
  {
    id: 'case-ester-rxn',
    index: 2,
    titleZh: '费歇尔酯化反应',
    formulaOrTag: '乙酸 + 乙醇',
    categoryLabel: '反应过渡态',
    actionLabel: '反应路径动画',
    description: '动态演示“酸脱羟基、醇脱氢”亲核酰基取代过渡态 [‡] 断键与成键',
    accentHex: '#34d399',
    visual: {
      type: 'reaction-pair',
      reactantAId: 'acetic-acid',
      reactantBId: 'ethanol',
    },
    destination: {
      kind: 'reaction',
      reactantAId: 'acetic-acid',
      reactantBId: 'ethanol',
      reactionTitle: '费歇尔酯化反应',
    },
  },
  {
    id: 'case-gold-atom',
    index: 3,
    titleZh: '金原子电子层',
    formulaOrTag: '₇₉Au · 6 壳层',
    categoryLabel: '三维原子',
    actionLabel: '三维壳层详情',
    description: '观察 79 号金元素六层玻尔电子排布 [Xe] 4f¹⁴ 5d¹⁰ 6s¹ 立体运转',
    accentHex: '#fbbf24',
    visual: {
      type: 'bohr-atom',
      elementSymbol: 'Au',
      shellCount: 4,
    },
    destination: {
      kind: 'atom',
      elementSymbol: 'Au',
      atomViewMode: 'bohr',
    },
  },
  {
    id: 'case-carbon-2pz',
    index: 4,
    titleZh: '碳 2p₂ 电子云',
    formulaOrTag: '₆C · ψ 波函数',
    categoryLabel: '量子轨道',
    actionLabel: '量子波函数详情',
    description: '氢原子波函数蒙特卡洛采样双相位概率云与 xy 角度节面',
    accentHex: '#f472b6',
    visual: {
      type: 'quantum-orbital',
      elementSymbol: 'C',
      orbitalId: '2pz',
    },
    destination: {
      kind: 'atom',
      elementSymbol: 'C',
      atomViewMode: 'quantum',
      quantumOrbitalId: '2pz',
    },
  },
  {
    id: 'case-benzene',
    index: 5,
    titleZh: '苯环共轭体系',
    formulaOrTag: 'C₆H₆ · D₆h',
    categoryLabel: '芳香有机',
    actionLabel: '共轭结构详情',
    description: '正六边形平面碳环与六中心六电子大 π 键离域环流模型',
    accentHex: '#a78bfa',
    visual: { type: 'molecule', moleculeId: 'benzene', style: 'cpk' },
    destination: {
      kind: 'molecule',
      moleculeId: 'benzene',
      renderStyle: 'ball-stick',
    },
  },
  {
    id: 'case-diamond',
    index: 6,
    titleZh: '金刚石晶胞',
    formulaOrTag: 'C · sp³ 晶格',
    categoryLabel: '晶体晶胞',
    actionLabel: '晶胞结构详情',
    description: '面心立方套构正四面体碳原子晶胞，展现共价晶体三维对称性',
    accentHex: '#2dd4bf',
    visual: { type: 'molecule', moleculeId: 'diamond', style: 'cpk' },
    destination: {
      kind: 'molecule',
      moleculeId: 'diamond',
      renderStyle: 'ball-stick',
    },
  },
  {
    id: 'case-combustion-rxn',
    index: 7,
    titleZh: '甲烷完全燃烧',
    formulaOrTag: 'CH₄ + 2O₂',
    categoryLabel: '放热反应',
    actionLabel: '燃烧势能模拟',
    description: '强放热氧化反应（ΔH = -890.3 kJ/mol）三维断键重组与势能曲线',
    accentHex: '#fb7185',
    visual: {
      type: 'reaction-pair',
      reactantAId: 'methane',
      reactantBId: 'oxygen',
    },
    destination: {
      kind: 'reaction',
      reactantAId: 'methane',
      reactantBId: 'oxygen',
      reactionTitle: '甲烷完全燃烧',
    },
  },
];

export const ORBIT_RADIUS_X = 7.9;
export const ORBIT_RADIUS_Z = 6.05;

/**
 * Computes deterministic 3D world coordinates for each satellite around the central hero model.
 * Uses a +π/8 phase offset so at orbitAngleRad=0 no satellite aligns directly in front of or behind (0,0,0).
 */
export function computeSatelliteWorldPosition(
  index: number,
  total: number,
  orbitAngleRad: number
): [number, number, number] {
  const safeTotal = Math.max(1, total);
  const theta =
    orbitAngleRad + (index / safeTotal) * Math.PI * 2 + Math.PI / safeTotal;
  const x = Math.sin(theta) * ORBIT_RADIUS_X;
  const z = Math.cos(theta) * ORBIT_RADIUS_Z;
  // Tilted orbital plane: rear satellites (z < 0) sit higher, front satellites (z > 0) sit slightly lower
  const planeTiltY = -0.78 * Math.cos(theta);
  const harmonicWaveY = (index % 2 === 0 ? 0.24 : -0.2) * Math.sin(theta * 2 + 0.4);
  const y = 0.28 + planeTiltY + harmonicWaveY;
  return [
    Number(x.toFixed(4)),
    Number(y.toFixed(4)),
    Number(z.toFixed(4)),
  ];
}

/**
 * Centers and uniformly scales a MoleculeModel's 3D atom coordinates to fit cleanly inside `targetRadius`.
 */
export function normalizeMoleculeCoordsForStage(
  molecule: MoleculeModel,
  targetRadius: number
): { atoms: NormalizedAtomCoord[]; scaleFactor: number } {
  if (molecule.atoms.length === 0) {
    return { atoms: [], scaleFactor: 1 };
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const a of molecule.atoms) {
    cx += a.x;
    cy += a.y;
    cz += a.z;
  }
  cx /= molecule.atoms.length;
  cy /= molecule.atoms.length;
  cz /= molecule.atoms.length;

  let maxR = 0.65;
  for (const a of molecule.atoms) {
    const d = Math.hypot(a.x - cx, a.y - cy, a.z - cz);
    if (d > maxR) maxR = d;
  }

  const scaleFactor = targetRadius / maxR;
  const atoms: NormalizedAtomCoord[] = molecule.atoms.map((a) => ({
    id: a.id,
    element: a.element,
    x: (a.x - cx) * scaleFactor,
    y: (a.y - cy) * scaleFactor,
    z: (a.z - cz) * scaleFactor,
  }));

  return { atoms, scaleFactor };
}

/**
 * Validates that all showcase hero and satellite targets point to real built-in entities.
 */
export function validateHomeShowcaseIntegrity(): boolean {
  for (const hero of HOME_HERO_MODELS) {
    if (!MOLECULE_BY_ID[hero.moleculeId]) return false;
  }
  for (const sat of HOME_SATELLITE_CASES) {
    if (sat.destination.kind === 'molecule') {
      if (!MOLECULE_BY_ID[sat.destination.moleculeId]) return false;
    } else if (sat.destination.kind === 'atom') {
      if (!ELEMENT_BY_SYMBOL[sat.destination.elementSymbol]) return false;
    } else if (sat.destination.kind === 'reaction') {
      if (
        !MOLECULE_BY_ID[sat.destination.reactantAId] ||
        !MOLECULE_BY_ID[sat.destination.reactantBId]
      ) {
        return false;
      }
    }
  }
  return true;
}

// Type guard helper ensuring ShowcaseRenderStyle defaults cleanly
export function toStageRenderStyle(
  style?: ShowcaseRenderStyle
): ShowcaseRenderStyle {
  return style ?? 'ball-stick';
}
