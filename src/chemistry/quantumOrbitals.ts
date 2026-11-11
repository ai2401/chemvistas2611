import { ChemicalElement } from './elements';

export type QuantumOrbitalId =
  | '1s'
  | '2s'
  | '2pz'
  | '2px'
  | '2py'
  | '3dz2'
  | '3dx2-y2'
  | '3dxy'
  | '4fz3'
  | 'sp'
  | 'sp2'
  | 'sp3';

export interface QuantumOrbitalMeta {
  id: QuantumOrbitalId;
  label: string;
  subshellTitle: string;
  quantumNumbers: string;
  nodalSummary: string;
  description: string;
}

export interface OrbitalCloudPoint {
  x: number;
  y: number;
  z: number;
  phase: 1 | -1;
  density: number; // Normalized [0..1]
}

export interface OrbitalLobeSpec {
  direction: [number, number, number];
  phase: 1 | -1;
  length: number;
  width: number;
  isTorusBelt?: boolean;
  torusNormal?: [number, number, number];
  torusRadius?: number;
  torusTube?: number;
}

export interface QuantumOrbital3DData {
  meta: QuantumOrbitalMeta;
  points: OrbitalCloudPoint[];
  lobes: OrbitalLobeSpec[];
  boundingRadius: number;
}

export const QUANTUM_ORBITAL_LIST: QuantumOrbitalMeta[] = [
  {
    id: '1s',
    label: '1s',
    subshellTitle: '1s 基态球对称轨道',
    quantumNumbers: 'n = 1, l = 0, m = 0',
    nodalSummary: '无节面 (0 个径向节面 · 0 个角度节面)',
    description: '球对称电子云，电子在原子核周围各方向出现的概率密度仅与径向距离 r 有关，离核越近概率密度越高。',
  },
  {
    id: '2s',
    label: '2s',
    subshellTitle: '2s 径向节面球轨道',
    quantumNumbers: 'n = 2, l = 0, m = 0',
    nodalSummary: '1 个球形径向节面 (r = 2a₀)',
    description: '由内层正相位球核与外层负相位球壳组成，中间存在一个概率密度严格为零的球形径向节面。',
  },
  {
    id: '2pz',
    label: '2pz',
    subshellTitle: '2pz 轴向哑铃轨道',
    quantumNumbers: 'n = 2, l = 1, m = 0',
    nodalSummary: '1 个角度节面 (xy 平面)',
    description: '沿 Z 轴对称分布的双瓣哑铃形轨道，上半瓣为正相位 (ψ > 0)，下半瓣为负相位 (ψ < 0)，xy 平面为节面。',
  },
  {
    id: '2px',
    label: '2px',
    subshellTitle: '2px 横向哑铃轨道',
    quantumNumbers: 'n = 2, l = 1, m = ±1 (线性组合)',
    nodalSummary: '1 个角度节面 (yz 平面)',
    description: '沿 X 轴取向的 p 轨道电子云，可形成头碰头 σ 键或肩并肩 π 键。',
  },
  {
    id: '2py',
    label: '2py',
    subshellTitle: '2py 纵向哑铃轨道',
    quantumNumbers: 'n = 2, l = 1, m = ±1 (线性组合)',
    nodalSummary: '1 个角度节面 (xz 平面)',
    description: '沿 Y 轴正交分布的哑铃形 p 轨道，与 2px、2pz 共同构成三维正交简并轨道组。',
  },
  {
    id: '3dz2',
    label: '3dz²',
    subshellTitle: '3dz² 轴向双瓣环带轨道',
    quantumNumbers: 'n = 3, l = 2, m = 0',
    nodalSummary: '2 个圆锥形角度节面 (3cos²θ - 1 = 0)',
    description: '过渡金属标志性 d 轨道，沿 Z 轴两端伸出同相正瓣，赤道 xy 平面环绕一圈反相负电势环带（Donut 环）。',
  },
  {
    id: '3dx2-y2',
    label: '3dx²-y²',
    subshellTitle: '3dx²-y² 轴向四叶草轨道',
    quantumNumbers: 'n = 3, l = 2, m = ±2',
    nodalSummary: '2 个正交对角角度节面 (x = ±y)',
    description: '四个花瓣严格指向 ±X 与 ±Y 坐标轴，在八面体或平面四方配合物晶体场分裂中能量最高。',
  },
  {
    id: '3dxy',
    label: '3dxy',
    subshellTitle: '3dxy 象限四叶草轨道',
    quantumNumbers: 'n = 3, l = 2, m = ±2',
    nodalSummary: '2 个坐标平面节面 (xz 与 yz 平面)',
    description: '四个轨道瓣位于 XY 平面的四个象限角平分线上，适合形成金属-配体 d-p π 反馈键。',
  },
  {
    id: '4fz3',
    label: '4fz³',
    subshellTitle: '4fz³ 镧/锕系多层极向轨道',
    quantumNumbers: 'n = 4, l = 3, m = 0',
    nodalSummary: '3 个角度节面 (xy 平面 + 双锥面)',
    description: '稀土镧系与锕系特征内层 4f 轨道，沿 Z 轴呈现正负交替的两极主瓣与双层赤道锥环结构。',
  },
  {
    id: 'sp',
    label: 'sp 杂化',
    subshellTitle: 'sp 直线型杂化轨道组 (180°)',
    quantumNumbers: '50% s + 50% p 线性叠加',
    nodalSummary: '双成键主瓣夹角 180.0° (如乙炔 C₂H₂、CO₂)',
    description: '由 1 个 s 轨道与 1 个 p 轨道杂化形成两条互成 180° 的高伸展成键主瓣，电子云高度集中于键轴方向。',
  },
  {
    id: 'sp2',
    label: 'sp² 杂化',
    subshellTitle: 'sp² 平面三角形杂化轨道组 (120°)',
    quantumNumbers: '33.3% s + 66.7% p 线性叠加',
    nodalSummary: '三成键主瓣互成 120.0° (如苯 C₆H₆、石墨)',
    description: '三个等价杂化轨道在同一平面内互成 120° 展开，剩余未杂化的 pz 轨道垂直平面形成离域 π 键。',
  },
  {
    id: 'sp3',
    label: 'sp³ 杂化',
    subshellTitle: 'sp³ 正四面体杂化轨道组 (109.5°)',
    quantumNumbers: '25% s + 75% p 线性叠加',
    nodalSummary: '四成键主瓣互成 109.47° (如甲烷 CH₄、金刚石)',
    description: '四个完全等价的成键主瓣指向正四面体四个顶点，构成饱和有机化合物与金刚石晶格的三维立体骨架。',
  },
];

export const QUANTUM_ORBITAL_MAP: Record<QuantumOrbitalId, QuantumOrbitalMeta> =
  Object.fromEntries(QUANTUM_ORBITAL_LIST.map((o) => [o.id, o])) as Record<
    QuantumOrbitalId,
    QuantumOrbitalMeta
  >;

/**
 * Selects the most representative valence quantum orbital for a given element.
 */
export function getDefaultOrbitalForElement(el: ChemicalElement): QuantumOrbitalId {
  if (el.block === 'f') return '4fz3';
  if (el.block === 'd') {
    return el.group && el.group >= 8 ? '3dx2-y2' : '3dz2';
  }
  if (el.block === 'p') {
    if (el.symbol === 'C') return 'sp3';
    if (el.group === 13 || el.group === 16) return '2px';
    if (el.group === 14 || el.group === 17) return '2py';
    return '2pz';
  }
  return el.period === 1 ? '1s' : '2s';
}

// Deterministic fast PRNG (Mulberry32) so orbital point clouds are reproducible and unit-testable
function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Evaluates unnormalized real wavefunction amplitude ψ(x, y, z) for visual coordinate space r in [-3.4, 3.4].
 * Notice: in Three.js Y is vertical, so chemical polar axis Z maps to visual Y so 2pz / 3dz² stand upright!
 */
export function evaluateOrbitalWavefunction(
  orbitalId: QuantumOrbitalId,
  vx: number,
  vy: number,
  vz: number
): number {
  // Map chemical (x, y, z_polar) -> visual (vx, vz, vy) so polar Z is upright on screen
  const x = vx;
  const y = vz;
  const z = vy;
  const r = Math.hypot(x, y, z);
  if (r < 1e-5) {
    return orbitalId === '1s' || orbitalId === '2s' ? 1.0 : 0.0;
  }

  switch (orbitalId) {
    case '1s': {
      return Math.exp(-r * 1.15);
    }
    case '2s': {
      const rho = r * 1.25;
      return (2 - rho) * Math.exp(-rho * 0.52);
    }
    case '2pz': {
      return z * Math.exp(-r * 0.85);
    }
    case '2px': {
      return x * Math.exp(-r * 0.85);
    }
    case '2py': {
      return y * Math.exp(-r * 0.85);
    }
    case '3dz2': {
      return ((3 * z * z - r * r) / (r + 0.15)) * Math.exp(-r * 0.78);
    }
    case '3dx2-y2': {
      return ((x * x - y * y) / (r + 0.15)) * Math.exp(-r * 0.78);
    }
    case '3dxy': {
      return ((2 * x * y) / (r + 0.15)) * Math.exp(-r * 0.78);
    }
    case '4fz3': {
      const cosTheta = z / r;
      return r * cosTheta * (5 * cosTheta * cosTheta - 3) * Math.exp(-r * 0.76);
    }
    case 'sp':
    case 'sp2':
    case 'sp3': {
      const dirs: [number, number, number][] =
        orbitalId === 'sp'
          ? [
              [1, 0, 0],
              [-1, 0, 0],
            ]
          : orbitalId === 'sp2'
            ? [
                [1, 0, 0],
                [-0.5, 0, Math.sqrt(3) / 2],
                [-0.5, 0, -Math.sqrt(3) / 2],
              ]
            : [
                [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
                [1 / Math.sqrt(3), -1 / Math.sqrt(3), -1 / Math.sqrt(3)],
                [-1 / Math.sqrt(3), 1 / Math.sqrt(3), -1 / Math.sqrt(3)],
                [-1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
              ];

      // Pick dominant hybrid lobe alignment at (vx, vy, vz)
      let bestAmp = 0;
      for (const [dx, dy, dz] of dirs) {
        const cosA = (vx * dx + vy * dy + vz * dz) / r;
        const amp = (0.42 + 1.25 * cosA) * r * Math.exp(-r * 0.92);
        if (Math.abs(amp) > Math.abs(bestAmp)) {
          bestAmp = amp;
        }
      }
      return bestAmp;
    }
  }
}

function buildLobeSpecs(orbitalId: QuantumOrbitalId): OrbitalLobeSpec[] {
  switch (orbitalId) {
    case '1s':
      return [{ direction: [0, 1, 0], phase: 1, length: 1.55, width: 1.55 }];
    case '2s':
      return [
        { direction: [0, 1, 0], phase: 1, length: 0.95, width: 0.95 },
        { direction: [0, 1, 0], phase: -1, length: 2.35, width: 2.35 },
      ];
    case '2pz':
      return [
        { direction: [0, 1, 0], phase: 1, length: 2.45, width: 1.32 },
        { direction: [0, -1, 0], phase: -1, length: 2.45, width: 1.32 },
      ];
    case '2px':
      return [
        { direction: [1, 0, 0], phase: 1, length: 2.45, width: 1.32 },
        { direction: [-1, 0, 0], phase: -1, length: 2.45, width: 1.32 },
      ];
    case '2py':
      return [
        { direction: [0, 0, 1], phase: 1, length: 2.45, width: 1.32 },
        { direction: [0, 0, -1], phase: -1, length: 2.45, width: 1.32 },
      ];
    case '3dz2':
      return [
        { direction: [0, 1, 0], phase: 1, length: 2.65, width: 1.15 },
        { direction: [0, -1, 0], phase: 1, length: 2.65, width: 1.15 },
        {
          direction: [0, 1, 0],
          phase: -1,
          length: 1,
          width: 1,
          isTorusBelt: true,
          torusNormal: [0, 1, 0],
          torusRadius: 1.42,
          torusTube: 0.36,
        },
      ];
    case '3dx2-y2':
      return [
        { direction: [1, 0, 0], phase: 1, length: 2.45, width: 1.08 },
        { direction: [-1, 0, 0], phase: 1, length: 2.45, width: 1.08 },
        { direction: [0, 0, 1], phase: -1, length: 2.45, width: 1.08 },
        { direction: [0, 0, -1], phase: -1, length: 2.45, width: 1.08 },
      ];
    case '3dxy': {
      const s = Math.SQRT1_2;
      return [
        { direction: [s, 0, s], phase: 1, length: 2.45, width: 1.08 },
        { direction: [-s, 0, -s], phase: 1, length: 2.45, width: 1.08 },
        { direction: [s, 0, -s], phase: -1, length: 2.45, width: 1.08 },
        { direction: [-s, 0, s], phase: -1, length: 2.45, width: 1.08 },
      ];
    }
    case '4fz3':
      return [
        { direction: [0, 1, 0], phase: 1, length: 2.75, width: 1.02 },
        { direction: [0, -1, 0], phase: -1, length: 2.75, width: 1.02 },
        {
          direction: [0, 1, 0],
          phase: -1,
          length: 0.42,
          width: 1,
          isTorusBelt: true,
          torusNormal: [0, 1, 0],
          torusRadius: 1.52,
          torusTube: 0.28,
        },
        {
          direction: [0, -1, 0],
          phase: 1,
          length: -0.42,
          width: 1,
          isTorusBelt: true,
          torusNormal: [0, 1, 0],
          torusRadius: 1.52,
          torusTube: 0.28,
        },
      ];
    case 'sp':
      return [
        { direction: [1, 0, 0], phase: 1, length: 2.55, width: 1.18 },
        { direction: [-1, 0, 0], phase: 1, length: 2.55, width: 1.18 },
      ];
    case 'sp2':
      return [
        { direction: [1, 0, 0], phase: 1, length: 2.45, width: 1.15 },
        { direction: [-0.5, 0, Math.sqrt(3) / 2], phase: 1, length: 2.45, width: 1.15 },
        { direction: [-0.5, 0, -Math.sqrt(3) / 2], phase: 1, length: 2.45, width: 1.15 },
      ];
    case 'sp3': {
      const inv = 1 / Math.sqrt(3);
      return [
        { direction: [inv, inv, inv], phase: 1, length: 2.42, width: 1.14 },
        { direction: [inv, -inv, -inv], phase: 1, length: 2.42, width: 1.14 },
        { direction: [-inv, inv, -inv], phase: 1, length: 2.42, width: 1.14 },
        { direction: [-inv, -inv, inv], phase: 1, length: 2.42, width: 1.14 },
      ];
    }
  }
}

/**
 * Generates deterministic Monte-Carlo probability density points |ψ|² and analytical isosurface lobe specs.
 */
export function buildQuantumOrbital3D(
  orbitalId: QuantumOrbitalId,
  targetPointCount = 2000
): QuantumOrbital3DData {
  const meta = QUANTUM_ORBITAL_MAP[orbitalId];
  const rng = createSeededRng(
    orbitalId.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 1337)
  );

  // Estimate peak |ψ|² on a coarse grid first so rejection sampling is well-calibrated
  let maxProb = 1e-6;
  const extent = 3.2;
  for (let ix = -6; ix <= 6; ix++) {
    for (let iy = -6; iy <= 6; iy++) {
      for (let iz = -6; iz <= 6; iz++) {
        const px = (ix / 6) * 2.4;
        const py = (iy / 6) * 2.4;
        const pz = (iz / 6) * 2.4;
        const psi = evaluateOrbitalWavefunction(orbitalId, px, py, pz);
        const p2 = psi * psi;
        if (p2 > maxProb) maxProb = p2;
      }
    }
  }

  const points: OrbitalCloudPoint[] = [];
  let maxR = 2.4;
  let attempts = 0;
  const maxAttempts = targetPointCount * 45;

  while (points.length < targetPointCount && attempts < maxAttempts) {
    attempts++;
    const vx = (rng() * 2 - 1) * extent;
    const vy = (rng() * 2 - 1) * extent;
    const vz = (rng() * 2 - 1) * extent;
    const r = Math.hypot(vx, vy, vz);
    if (r > extent || r < 0.08) continue;

    const psi = evaluateOrbitalWavefunction(orbitalId, vx, vy, vz);
    const probNorm = (psi * psi) / maxProb;
    // Slight gamma compression makes outer nodal shells & rings clearly visible
    const acceptWeight = Math.pow(probNorm, 0.72);
    if (rng() < acceptWeight && probNorm > 0.015) {
      points.push({
        x: Number(vx.toFixed(3)),
        y: Number(vy.toFixed(3)),
        z: Number(vz.toFixed(3)),
        phase: psi >= 0 ? 1 : -1,
        density: Number(Math.min(1, probNorm).toFixed(3)),
      });
      if (r > maxR) maxR = r;
    }
  }

  return {
    meta,
    points,
    lobes: buildLobeSpecs(orbitalId),
    boundingRadius: Number(maxR.toFixed(2)),
  };
}
