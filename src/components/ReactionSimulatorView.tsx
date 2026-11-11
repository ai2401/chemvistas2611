import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Snowflake,
  Upload,
} from 'lucide-react';
import { ELEMENT_BY_SYMBOL } from '../chemistry/elements';
import { MOLECULE_BY_ID, MoleculeModel } from '../chemistry/molecules';
import { analyzeMoleculeComposition } from '../chemistry/calculations';
import {
  CLASSIC_REACTION_PRESETS,
  ReactionSimulationResult,
  simulateChemicalReaction,
} from '../chemistry/reactions';
import {
  buildReactionPathway,
  clamp01,
  getReactionPhaseDescriptor,
} from '../chemistry/reactionPathway';
import {
  ChemistryStage3D,
  ChemistryStage3DHandle,
  RenderStyle,
} from './ChemistryStage3D';
import { ReactionPathwayStage3D } from './ReactionPathwayStage3D';
import { getSafeElementNameZh } from '../utils/glyphSupport';

interface ReactionSimulatorViewProps {
  molecules: MoleculeModel[];
  initialReactantAId?: string;
  initialReactantBId?: string;
  onOpenMoleculeInWorkspace: (mol: MoleculeModel) => void;
  onOpenImportModal: () => void;
  onExportNotice?: (msg: string) => void;
}

interface EnergyCoordinateChartProps {
  result: ReactionSimulationResult;
  progress: number; // 0..1 synchronized with 3D reaction pathway
}

function evalCubicBezier(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const u = 1 - t;
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  );
}

function EnergyCoordinateChart({
  result,
  progress,
}: EnergyCoordinateChartProps) {
  const width = 368;
  const height = 166;
  const padL = 44;
  const padR = 18;
  const padT = 22;
  const padB = 28;
  const p = clamp01(progress);

  if (!result.occurs) {
    const baseY = 104;
    const climb = p <= 0.5 ? p / 0.5 : (1 - p) / 0.5;
    const markerX = padL + 30 + climb * 92;
    const markerY = baseY - climb * climb * 38;

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block select-none"
        role="img"
        aria-label="常温无化学断键反应势能示意"
      >
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={height - padB}
          stroke="#334155"
          strokeWidth="1"
        />
        <line
          x1={padL}
          y1={height - padB}
          x2={width - padR}
          y2={height - padB}
          stroke="#334155"
          strokeWidth="1"
        />
        <path
          d={`M ${padL + 8} ${baseY} L ${padL + 95} ${baseY} C ${padL + 135} ${baseY}, ${padL + 135} ${padT + 14}, ${padL + 162} ${padT + 14} C ${padL + 190} ${padT + 14}, ${padL + 190} ${baseY}, ${padL + 230} ${baseY} L ${width - padR - 8} ${baseY}`}
          fill="none"
          stroke="#475569"
          strokeWidth="1.75"
          strokeDasharray="4 4"
        />
        <line
          x1={padL + 8}
          y1={baseY}
          x2={padL + 96}
          y2={baseY}
          stroke="#38bdf8"
          strokeWidth="2.5"
        />
        {/* Live Elastic Collision Marker */}
        <circle
          cx={markerX}
          cy={markerY}
          r="6.5"
          fill="rgba(56, 189, 248, 0.22)"
          stroke="#38bdf8"
          strokeWidth="1.2"
        />
        <circle cx={markerX} cy={markerY} r="3.2" fill="#e0f2fe" />
        <text
          x={padL + 52}
          y={baseY - 8}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="10"
        >
          混合初态 (0)
        </text>
        <text
          x={padL + 162}
          y={padT + 10}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="10"
        >
          断键能垒过高 · 常温不跨越
        </text>
        <text
          x={width / 2 + 10}
          y={height - 8}
          textAnchor="middle"
          fill="#64748b"
          fontSize="10"
        >
          反应坐标 (弹性碰撞无共价重排)
        </text>
        <text
          x={12}
          y={height / 2}
          textAnchor="middle"
          fill="#64748b"
          fontSize="10"
          transform={`rotate(-90 12 ${height / 2})`}
        >
          相对势能
        </text>
      </svg>
    );
  }

  // Map energy values E in [minE, maxE] to SVG Y coordinates
  const eReactant = 0;
  const ePeak = Math.max(25, result.activationEnergyKj);
  const eProduct = result.enthalpyKjPerMol;

  const maxE = ePeak * 1.28;
  const minE = Math.min(0, eProduct) - Math.max(35, Math.abs(eProduct) * 0.16);
  const spanE = Math.max(60, maxE - minE);

  const mapY = (e: number) =>
    padT + ((maxE - e) / spanE) * (height - padT - padB);

  const yR = mapY(eReactant);
  const yTS = mapY(ePeak);
  const yP = mapY(eProduct);

  const x0 = padL + 8;
  const xR1 = padL + 74;
  const xTS = padL + 156;
  const xP0 = padL + 238;
  const x1 = width - padR - 6;

  const isExothermic = eProduct < 0;
  const curveColor = isExothermic ? '#34d399' : '#fbbf24';

  const dCurve = [
    `M ${x0} ${yR}`,
    `L ${xR1} ${yR}`,
    `C ${xR1 + 36} ${yR}, ${xTS - 30} ${yTS}, ${xTS} ${yTS}`,
    `C ${xTS + 30} ${yTS}, ${xP0 - 36} ${yP}, ${xP0} ${yP}`,
    `L ${x1} ${yP}`,
  ].join(' ');

  // Evaluate exact live marker (mx, my) on the energy profile at progress p
  let mx = x0;
  let my = yR;
  if (p <= 0.16) {
    const u = p / 0.16;
    mx = x0 + (xR1 - x0) * u;
    my = yR;
  } else if (p <= 0.5) {
    const u = (p - 0.16) / 0.34;
    mx = evalCubicBezier(xR1, xR1 + 36, xTS - 30, xTS, u);
    my = evalCubicBezier(yR, yR, yTS, yTS, u);
  } else if (p <= 0.84) {
    const u = (p - 0.5) / 0.34;
    mx = evalCubicBezier(xTS, xTS + 30, xP0 - 36, xP0, u);
    my = evalCubicBezier(yTS, yTS, yP, yP, u);
  } else {
    const u = (p - 0.84) / 0.16;
    mx = xP0 + (x1 - xP0) * u;
    my = yP;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto block select-none"
      role="img"
      aria-label={`反应坐标势能剖面图：活化能 ${result.activationEnergyKj} kJ/mol，反应焓变 ${result.enthalpyKjPerMol} kJ/mol，当前转化进程 ${Math.round(p * 100)}%`}
    >
      {/* Axes */}
      <line
        x1={padL}
        y1={padT - 4}
        x2={padL}
        y2={height - padB}
        stroke="#334155"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={height - padB}
        x2={width - padR}
        y2={height - padB}
        stroke="#334155"
        strokeWidth="1"
      />

      {/* Reactant zero reference dashed line */}
      <line
        x1={xR1}
        y1={yR}
        x2={x1}
        y2={yR}
        stroke="#475569"
        strokeWidth="1"
        strokeDasharray="3 3"
      />

      {/* Activation energy Ea vertical guide */}
      <line
        x1={xTS}
        y1={yR}
        x2={xTS}
        y2={yTS + 3}
        stroke="#38bdf8"
        strokeWidth="1.2"
        strokeDasharray="2.5 2.5"
      />

      {/* Enthalpy ΔH vertical guide */}
      <line
        x1={xP0 + 18}
        y1={yR}
        x2={xP0 + 18}
        y2={yP}
        stroke={curveColor}
        strokeWidth="1.4"
      />

      {/* Potential Energy Curve */}
      <path
        d={dCurve}
        fill="none"
        stroke={curveColor}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Live Synchronized Reaction Coordinate Marker */}
      <line
        x1={mx}
        y1={my}
        x2={mx}
        y2={height - padB}
        stroke="rgba(56, 189, 248, 0.35)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle
        cx={mx}
        cy={my}
        r="6.5"
        fill="rgba(56, 189, 248, 0.24)"
        stroke="#38bdf8"
        strokeWidth="1.4"
      />
      <circle cx={mx} cy={my} r="3.2" fill="#f8fafc" />

      {/* Plateau Labels */}
      <text
        x={(x0 + xR1) / 2}
        y={yR - 7}
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize="10"
        fontWeight="600"
      >
        反应物
      </text>
      <text
        x={xTS}
        y={Math.max(12, yTS - 10)}
        textAnchor="middle"
        fill="#7dd3fc"
        fontSize="10"
        fontFamily="monospace"
      >
        Ea = +{result.activationEnergyKj} [‡]
      </text>
      <text
        x={(xP0 + x1) / 2}
        y={eProduct < 0 ? Math.min(height - padB - 5, yP + 13) : yP - 7}
        textAnchor="middle"
        fill={curveColor}
        fontSize="10"
        fontWeight="600"
      >
        产物 ({eProduct > 0 ? `+${eProduct}` : eProduct})
      </text>

      {/* Axis captions */}
      <text
        x={(padL + width - padR) / 2}
        y={height - 8}
        textAnchor="middle"
        fill="#64748b"
        fontSize="10"
      >
        反应进程 (Reaction Coordinate)
      </text>
      <text
        x={13}
        y={(padT + height - padB) / 2}
        textAnchor="middle"
        fill="#64748b"
        fontSize="10"
        transform={`rotate(-90 13 ${(padT + height - padB) / 2})`}
      >
        势能 (kJ/mol)
      </text>
    </svg>
  );
}

export const ReactionSimulatorView = forwardRef<
  ChemistryStage3DHandle,
  ReactionSimulatorViewProps
>(function ReactionSimulatorView(
  {
    molecules,
    initialReactantAId,
    initialReactantBId,
    onOpenMoleculeInWorkspace,
    onOpenImportModal,
  },
  stageRef
) {
  const [reactantAId, setReactantAId] = useState<string>(
    initialReactantAId ?? 'methane'
  );
  const [reactantBId, setReactantBId] = useState<string>(
    initialReactantBId ?? 'oxygen'
  );

  // Stage View Mode: 'pathway' (animated reactant -> TS -> product 3D transition) | 'species' (single molecule 3D inspector)
  const [stageViewMode, setStageViewMode] = useState<'pathway' | 'species'>(
    'pathway'
  );
  const [pathwayProgress, setPathwayProgress] = useState<number>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return 1;
    }
    return 0;
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return false;
    }
    return true;
  });
  const [playbackSeed, setPlaybackSeed] = useState<number>(0);

  // 3D Stage Controls inside Reaction Simulator (keyed by simulation.id for zero-lag product focus)
  const [roleSelection, setRoleSelection] = useState<{
    simId: string;
    roleKey: string;
  }>({ simId: '', roleKey: 'product-0' });
  const [selectedAtomId, setSelectedAtomId] = useState<number | null>(0);
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('ball-stick');
  const [showDipoleVector, setShowDipoleVector] = useState<boolean>(false);
  const [showAtomLabels, setShowAtomLabels] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);

  const moleculeMap = useMemo(() => {
    const map = new Map<string, MoleculeModel>();
    for (const m of molecules) {
      map.set(m.id, m);
    }
    return map;
  }, [molecules]);

  const reactantA =
    moleculeMap.get(reactantAId) ?? MOLECULE_BY_ID['methane'] ?? molecules[0];
  const reactantB =
    moleculeMap.get(reactantBId) ?? MOLECULE_BY_ID['oxygen'] ?? molecules[1] ?? molecules[0];

  const simulation = useMemo(
    () => simulateChemicalReaction(reactantA, reactantB),
    [reactantA, reactantB]
  );

  const pathway = useMemo(() => buildReactionPathway(simulation), [simulation]);
  const phaseDescriptor = useMemo(
    () => getReactionPhaseDescriptor(pathwayProgress, simulation.occurs),
    [pathwayProgress, simulation.occurs]
  );

  const inspectedRoleKey =
    roleSelection.simId === simulation.id ? roleSelection.roleKey : 'product-0';

  // Whenever the user chooses a new reaction pair, play the 3D pathway transition from 0% -> 100%
  useEffect(() => {
    const primaryMol = simulation.products[0]?.molecule ?? reactantA;
    setSelectedAtomId(primaryMol.atoms[0]?.id ?? null);
    setStageViewMode('pathway');
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPathwayProgress(1);
      setIsPlaying(false);
    } else {
      setPathwayProgress(0);
      setIsPlaying(true);
      setPlaybackSeed((s) => s + 1);
    }
  }, [simulation.id, reactantA.id, reactantB.id, reactantA, simulation.products]);

  const handleTogglePlayPathway = useCallback(() => {
    setStageViewMode('pathway');
    if (isPlaying) {
      setIsPlaying(false);
    } else if (pathwayProgress >= 0.99) {
      setPathwayProgress(0);
      setIsPlaying(true);
      setPlaybackSeed((s) => s + 1);
    } else {
      setIsPlaying(true);
    }
  }, [isPlaying, pathwayProgress]);

  const handleJumpToStage = useCallback((targetP: number) => {
    setStageViewMode('pathway');
    setIsPlaying(false);
    setPathwayProgress(clamp01(targetP));
  }, []);

  const inspectedSpecies = useMemo(() => {
    if (inspectedRoleKey.startsWith('reactant-')) {
      const idx = Number(inspectedRoleKey.replace('reactant-', ''));
      const term = simulation.reactants[idx];
      if (term) {
        return {
          molecule: term.molecule,
          badgeText: `反应物 ${idx + 1}`,
          roleLabel: term.roleLabel ?? '起始反应物',
        };
      }
    }
    if (inspectedRoleKey.startsWith('product-')) {
      const idx = Number(inspectedRoleKey.replace('product-', ''));
      const term = simulation.products[idx];
      if (term) {
        return {
          molecule: term.molecule,
          badgeText: simulation.occurs ? `生成产物 ${idx + 1}` : `混合组分 ${idx + 1}`,
          roleLabel: term.roleLabel ?? (simulation.occurs ? '反应主产物' : '未反应原分子'),
        };
      }
    }
    const fallback = simulation.products[0]?.molecule ?? reactantA;
    return {
      molecule: fallback,
      badgeText: simulation.occurs ? '生成产物 1' : '混合组分 1',
      roleLabel: simulation.products[0]?.roleLabel ?? '反应产物',
    };
  }, [inspectedRoleKey, simulation, reactantA]);

  const inspectedMolecule = inspectedSpecies.molecule;

  const inspectedComposition = useMemo(
    () => analyzeMoleculeComposition(inspectedMolecule),
    [inspectedMolecule]
  );

  const activeStageElement = useMemo(() => {
    const atom =
      inspectedMolecule.atoms.find((a) => a.id === selectedAtomId) ??
      inspectedMolecule.atoms[0];
    return (atom && ELEMENT_BY_SYMBOL[atom.element]) || ELEMENT_BY_SYMBOL['C'];
  }, [inspectedMolecule, selectedAtomId]);

  const totalStoichiometricMass = useMemo(() => {
    return simulation.reactants.reduce((sum, term) => {
      const { molarMass } = analyzeMoleculeComposition(term.molecule);
      return sum + term.coefficient * molarMass;
    }, 0);
  }, [simulation]);

  const handleSwapReactants = () => {
    setReactantAId(reactantB.id);
    setReactantBId(reactantA.id);
  };

  const handleApplyPreset = (aId: string, bId: string) => {
    setReactantAId(aId);
    setReactantBId(bId);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:overflow-hidden bg-[#090D16]">
      {/* Left / Main Interactive Reaction & 3D Product Sandbox */}
      <section
        aria-label="化学反应配平与三维产物沙盒"
        className="flex-1 min-w-0 flex flex-col lg:h-full lg:overflow-hidden"
      >
        {/* Control Header: Dual Molecule Selectors + Quick Presets */}
        <div className="shrink-0 border-b border-slate-800/90 bg-[#0C1220] px-3 sm:px-5 py-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
            {/* Reactant A Selector */}
            <div className="flex-1 min-w-0">
              <label
                htmlFor="reactant-a-select"
                className="block text-[11px] font-semibold text-slate-400 mb-1"
              >
                选择反应物 A
              </label>
              <select
                id="reactant-a-select"
                value={reactantA.id}
                onChange={(e) => setReactantAId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-[#080C15] border border-slate-700/90 text-xs sm:text-sm font-medium text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                {molecules.map((mol) => (
                  <option key={mol.id} value={mol.id}>
                    {mol.nameZh} ({mol.formulaDisplay})
                  </option>
                ))}
              </select>
            </div>

            {/* Swap Button */}
            <div className="flex items-center justify-between sm:justify-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSwapReactants}
                title="交换反应物 A 与 B"
                className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                <span>交换</span>
              </button>

              <button
                type="button"
                onClick={onOpenImportModal}
                title="导入外部 .xyz/.sdf 或检索 PubChem 分子参与反应"
                className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-cyan-300 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">导入分子</span>
                <span className="xl:hidden">导入</span>
              </button>
            </div>

            {/* Reactant B Selector */}
            <div className="flex-1 min-w-0">
              <label
                htmlFor="reactant-b-select"
                className="block text-[11px] font-semibold text-slate-400 mb-1"
              >
                选择反应物 B
              </label>
              <select
                id="reactant-b-select"
                value={reactantB.id}
                onChange={(e) => setReactantBId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-[#080C15] border border-slate-700/90 text-xs sm:text-sm font-medium text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                {molecules.map((mol) => (
                  <option key={mol.id} value={mol.id}>
                    {mol.nameZh} ({mol.formulaDisplay})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Classic Reaction Presets Strip */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0">
              经典反应:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {CLASSIC_REACTION_PRESETS.map((preset) => {
                const isActive =
                  (reactantA.id === preset.reactantAId &&
                    reactantB.id === preset.reactantBId) ||
                  (reactantA.id === preset.reactantBId &&
                    reactantB.id === preset.reactantAId);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      handleApplyPreset(preset.reactantAId, preset.reactantBId)
                    }
                    aria-pressed={isActive}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                      isActive
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                        : 'bg-[#090E1A] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stoichiometric Equation & Interactive Species Selector Strip */}
        <div className="shrink-0 border-b border-slate-800/90 bg-[#0A0F1B] px-3 sm:px-5 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">
                {simulation.reactionType}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">
                反应条件：<strong className="font-medium text-cyan-300">{simulation.condition}</strong>
              </span>
            </div>

            {/* Non-hue-only Enthalpy Indicator */}
            <div className="font-mono tabular-nums text-xs">
              {!simulation.occurs ? (
                <span className="text-slate-400">
                  无共价断键反应 · ΔH = 0 kJ/mol
                </span>
              ) : simulation.enthalpyKjPerMol < 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                  <Flame className="w-3.5 h-3.5" />
                  <span>放热 ΔH = {simulation.enthalpyKjPerMol} kJ/mol</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                  <Snowflake className="w-3.5 h-3.5" />
                  <span>吸热 ΔH = +{simulation.enthalpyKjPerMol} kJ/mol</span>
                </span>
              )}
            </div>
          </div>

          {/* Clickable Stoichiometric Species Cards + Pathway Mode Toggle */}
          <div
            role="group"
            aria-label="反应转化路径与各物种三维模型切换"
            className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-0.5"
          >
            <button
              type="button"
              onClick={() => {
                setStageViewMode('pathway');
              }}
              aria-pressed={stageViewMode === 'pathway'}
              className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors shrink-0 ${
                stageViewMode === 'pathway'
                  ? 'bg-cyan-500/20 border-cyan-400 text-white'
                  : 'bg-[#0E1525] border-slate-800 text-slate-300 hover:border-cyan-500/60'
              }`}
            >
              <div className="flex items-center gap-1 font-semibold text-xs sm:text-sm text-cyan-200 whitespace-nowrap">
                <Play className="w-3 h-3 fill-current" />
                <span>转化路径动画</span>
              </div>
              <div className="text-[11px] text-slate-300 whitespace-nowrap">
                {stageViewMode === 'pathway'
                  ? `进程 ${phaseDescriptor.progressPercent}% · 视窗中`
                  : '反应物 → 过渡态 → 产物'}
              </div>
            </button>

            <span
              aria-hidden="true"
              className="h-7 w-px bg-slate-800 shrink-0 mx-0.5"
            />

            {simulation.reactants.map((term, idx) => {
              const key = `reactant-${idx}`;
              const selected =
                stageViewMode === 'species' && inspectedRoleKey === key;
              return (
                <React.Fragment key={key}>
                  {idx > 0 && (
                    <span className="text-sm font-mono font-bold text-slate-500 shrink-0">
                      +
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStageViewMode('species');
                      setIsPlaying(false);
                      setRoleSelection({ simId: simulation.id, roleKey: key });
                      setSelectedAtomId(term.molecule.atoms[0]?.id ?? null);
                    }}
                    aria-pressed={selected}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors shrink-0 ${
                      selected
                        ? 'bg-cyan-950/50 border-cyan-400 text-white'
                        : 'bg-[#0E1525] border-slate-800/90 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-baseline gap-1 font-mono text-xs sm:text-sm">
                      {term.coefficient > 1 && (
                        <span className="font-bold text-cyan-300">
                          {term.coefficient}
                        </span>
                      )}
                      <span className="font-semibold text-white">
                        {term.molecule.formulaDisplay}
                      </span>
                      {term.phaseTag && (
                        <span className="text-[10px] text-slate-400">
                          {term.phaseTag}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 whitespace-nowrap">
                      {term.molecule.nameZh}
                      {selected ? ' · 单分子检视' : ''}
                    </div>
                  </button>
                </React.Fragment>
              );
            })}

            {/* Reaction Arrow */}
            <div className="px-1.5 flex flex-col items-center justify-center shrink-0">
              <span className="text-[10px] text-cyan-300/90 whitespace-nowrap leading-none mb-0.5">
                {simulation.occurs ? simulation.condition.split('·')[0].trim() : '常温'}
              </span>
              <span className="text-base sm:text-lg font-mono font-bold text-cyan-400 leading-none">
                {!simulation.occurs ? '↛' : simulation.reversible ? '⇌' : '→'}
              </span>
            </div>

            {simulation.products.map((term, idx) => {
              const key = `product-${idx}`;
              const selected =
                stageViewMode === 'species' && inspectedRoleKey === key;
              return (
                <React.Fragment key={key}>
                  {idx > 0 && (
                    <span className="text-sm font-mono font-bold text-slate-500 shrink-0">
                      +
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStageViewMode('species');
                      setIsPlaying(false);
                      setRoleSelection({ simId: simulation.id, roleKey: key });
                      setSelectedAtomId(term.molecule.atoms[0]?.id ?? null);
                    }}
                    aria-pressed={selected}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors shrink-0 ${
                      selected
                        ? 'bg-emerald-950/45 border-emerald-400 text-white'
                        : 'bg-[#0E1624] border-slate-700/90 text-slate-200 hover:border-emerald-500/60'
                    }`}
                  >
                    <div className="flex items-baseline gap-1 font-mono text-xs sm:text-sm">
                      {term.coefficient > 1 && (
                        <span className="font-bold text-emerald-300">
                          {term.coefficient}
                        </span>
                      )}
                      <span className="font-semibold text-white">
                        {term.molecule.formulaDisplay}
                      </span>
                      {term.phaseTag && (
                        <span className="text-[10px] text-slate-400">
                          {term.phaseTag}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-300/90 whitespace-nowrap">
                      {term.molecule.nameZh}
                      {selected ? ' · 单分子检视' : ''}
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* 3D Pathway Animation Stage OR Single-Species 3D Inspector */}
        <div className="relative h-[280px] sm:h-[340px] lg:h-auto lg:flex-1 w-full min-h-0">
          {stageViewMode === 'pathway' ? (
            <ReactionPathwayStage3D
              ref={stageRef}
              pathway={pathway}
              progress={pathwayProgress}
              isPlaying={isPlaying}
              playbackSeed={playbackSeed}
              renderStyle={renderStyle === 'esp' ? 'ball-stick' : renderStyle}
              showAtomLabels={showAtomLabels}
              autoRotate={autoRotate}
              onProgressSync={setPathwayProgress}
              onPlaybackComplete={() => setIsPlaying(false)}
            />
          ) : (
            <ChemistryStage3D
              ref={stageRef}
              stageMode="molecule"
              atomViewMode="bohr"
              quantumOrbitalId="2pz"
              molecule={inspectedMolecule}
              moleculeRevision={0}
              activeElement={activeStageElement}
              selectedAtomId={selectedAtomId}
              highlightedElementSymbol={null}
              renderStyle={renderStyle}
              showDipoleVector={showDipoleVector}
              toolMode="inspect"
              measurementAtomIds={[]}
              pendingConnectAtomId={null}
              explodeFactor={0}
              atomScale={1.0}
              showAtomLabels={showAtomLabels}
              autoRotate={autoRotate}
              hideHeaderOverlay
              onAtomInteract={(atomId) => setSelectedAtomId(atomId)}
            />
          )}
        </div>

        {/* Reaction Pathway Timeline Scrubber & Stage Step Controls */}
        {stageViewMode === 'pathway' && (
          <div
            aria-label="反应转化路径播放与进程控制栏"
            className="shrink-0 border-t border-slate-800/90 bg-[#0D1424] px-3 sm:px-5 py-2 space-y-1.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleTogglePlayPathway}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>暂停动画</span>
                    </>
                  ) : pathwayProgress >= 0.99 ? (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>重播转化</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>播放转化</span>
                    </>
                  )}
                </button>

                <div
                  role="group"
                  aria-label="反应关键阶段快捷跳转"
                  className="flex items-center gap-1 overflow-x-auto"
                >
                  {(
                    [
                      [0, '初态: 反应物'],
                      [0.5, simulation.occurs ? '过渡态 [‡]' : '最近碰撞点'],
                      [1, simulation.occurs ? '终态: 产物' : '弹性分离'],
                    ] as [number, string][]
                  ).map(([targetVal, btnLabel]) => {
                    const active =
                      !isPlaying && Math.abs(pathwayProgress - targetVal) < 0.06;
                    return (
                      <button
                        key={btnLabel}
                        type="button"
                        onClick={() => handleJumpToStage(targetVal)}
                        aria-pressed={active}
                        className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                            : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                        }`}
                      >
                        {btnLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-slate-300 truncate">
                <span className="font-semibold text-cyan-300">
                  {phaseDescriptor.phaseTitle}
                </span>
                <span className="hidden xl:inline text-slate-400">
                  {' '}
                  · {phaseDescriptor.phaseDetail}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <label
                htmlFor="reaction-pathway-slider"
                className="text-[11px] font-medium text-slate-400 whitespace-nowrap shrink-0"
              >
                反应坐标进程:
              </label>
              <input
                id="reaction-pathway-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(pathwayProgress * 100)}
                aria-label="反应坐标进程百分比"
                onChange={(e) => {
                  setIsPlaying(false);
                  setPathwayProgress(Number(e.target.value) / 100);
                }}
                className="flex-1 h-1.5 accent-cyan-400 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="w-10 text-right font-mono tabular-nums text-xs font-semibold text-cyan-300 shrink-0">
                {phaseDescriptor.progressPercent}%
              </span>
            </div>
          </div>
        )}

        {/* Compact Stage Toolbar & Handoff to Main 3D Workspace */}
        <div className="shrink-0 border-t border-slate-800/90 bg-[#0B101B] px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs min-w-0">
            {stageViewMode === 'pathway' ? (
              <>
                <span className="font-semibold text-cyan-300 shrink-0">
                  主产物聚焦:
                </span>
                <span className="font-semibold text-white truncate">
                  {inspectedMolecule.nameZh} ({inspectedMolecule.formulaDisplay})
                </span>
                <span className="hidden sm:inline font-mono tabular-nums text-slate-400">
                  共 {pathway.atoms.length} 个守恒原子参与演化
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-cyan-300 shrink-0">
                  {inspectedSpecies.badgeText}:
                </span>
                <span className="font-semibold text-white truncate">
                  {inspectedMolecule.nameZh} ({inspectedMolecule.formulaDisplay})
                </span>
                <span className="hidden sm:inline font-mono tabular-nums text-slate-400">
                  {inspectedComposition.molarMass.toFixed(2)} g/mol ·{' '}
                  {inspectedMolecule.atoms.length} 原子
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {stageViewMode === 'species' && (
              <button
                type="button"
                onClick={() => {
                  setStageViewMode('pathway');
                  setPathwayProgress(0);
                  setIsPlaying(true);
                  setPlaybackSeed((s) => s + 1);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/70 text-[11px] font-semibold text-emerald-200 transition-colors"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>播放转化路径</span>
              </button>
            )}

            {(
              (stageViewMode === 'pathway'
                ? [
                    ['ball-stick', '球棍'],
                    ['space-filling', '填充'],
                    ['wireframe', '线框'],
                  ]
                : [
                    ['ball-stick', '球棍'],
                    ['space-filling', '填充'],
                    ['esp', '静电势'],
                    ['wireframe', '线框'],
                  ]) as [RenderStyle, string][]
            ).map(([styleKey, label]) => {
              const effectiveStyle =
                stageViewMode === 'pathway' && renderStyle === 'esp'
                  ? 'ball-stick'
                  : renderStyle;
              return (
                <button
                  key={styleKey}
                  type="button"
                  onClick={() => setRenderStyle(styleKey)}
                  aria-pressed={effectiveStyle === styleKey}
                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    effectiveStyle === styleKey
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}

            {stageViewMode === 'species' && (
              <button
                type="button"
                onClick={() => setShowDipoleVector((v) => !v)}
                aria-pressed={showDipoleVector}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                  showDipoleVector
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                偶极矩
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAtomLabels((v) => !v)}
              aria-pressed={showAtomLabels}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                showAtomLabels
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              原子标签
            </button>

            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              aria-pressed={autoRotate}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                autoRotate
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              自动旋转
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  stageRef &&
                  typeof stageRef !== 'function' &&
                  stageRef.current
                ) {
                  stageRef.current.setCameraPreset('reset');
                }
              }}
              title="复位三维相机视角"
              aria-label="复位三维相机视角"
              className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenMoleculeInWorkspace(inspectedMolecule)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/70 text-[11px] font-semibold text-cyan-200 transition-colors"
            >
              <span>在分子工作台中深度检视</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Right Column: Product Structure, Mechanism, Energy Profile & Atom Conservation */}
      <aside
        aria-label="反应机理、能量曲线与质量守恒面板"
        className="w-full lg:w-[410px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800/90 bg-[#0B101B] lg:h-full lg:overflow-y-auto divide-y divide-slate-800/85"
      >
        {/* Section 1: Inspected Product / Species Details */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                {inspectedSpecies.badgeText} · {inspectedSpecies.roleLabel}
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                {inspectedMolecule.nameZh}{' '}
                <span className="font-mono text-base text-cyan-300">
                  {inspectedMolecule.formulaDisplay}
                </span>
              </h2>
              <div className="text-xs text-slate-400">{inspectedMolecule.nameEn}</div>
            </div>
            <div className="text-right font-mono tabular-nums">
              <div className="text-sm font-semibold text-slate-100">
                {inspectedComposition.molarMass.toFixed(3)} g/mol
              </div>
              <div className="text-[11px] text-slate-400">
                {inspectedMolecule.atoms.length} 原子 · {inspectedMolecule.bonds.length} 化学键
              </div>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-300">
            {inspectedMolecule.description}
          </p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 text-xs">
            <div>
              <dt className="text-slate-500">空间构型</dt>
              <dd className="text-slate-200 font-medium mt-0.5">
                {inspectedMolecule.geometry}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">杂化与成键</dt>
              <dd className="text-slate-200 font-medium mt-0.5">
                {inspectedMolecule.hybridization}
              </dd>
            </div>
          </dl>
        </div>

        {/* Section 2: Chemical Bond Breaking/Forming & Phenomenon */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              断键重组机理与实验现象
            </h3>
            <div className="px-2.5 py-1.5 rounded bg-[#080C15] border border-slate-800/80 font-mono text-xs text-cyan-300 break-words">
              {simulation.equationText}
            </div>
          </div>

          <dl className="space-y-2.5 text-xs">
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-rose-300">旧键断裂</dt>
              <dd className="text-slate-300 leading-relaxed">
                {simulation.bondsBroken}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-emerald-300">新键生成</dt>
              <dd className="text-slate-300 leading-relaxed">
                {simulation.bondsFormed}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-cyan-300">化学常识与微观机理</dt>
              <dd className="text-slate-300 leading-relaxed">
                {simulation.mechanismSummary}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-amber-300">宏观反应现象</dt>
              <dd className="text-slate-300 leading-relaxed">
                {simulation.phenomenonNote}
              </dd>
            </div>
          </dl>
        </div>

        {/* Section 3: Potential Energy Coordinate Diagram */}
        <div className="p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              反应坐标势能变化曲线
            </h3>
            <span className="font-mono tabular-nums text-[11px] text-cyan-300">
              {stageViewMode === 'pathway'
                ? `进程 ${phaseDescriptor.progressPercent}% · `
                : ''}
              {simulation.occurs
                ? `Ea ≈ ${simulation.activationEnergyKj} kJ/mol`
                : '非反应稳态'}
            </span>
          </div>
          <div className="rounded-lg bg-[#080C15] border border-slate-800/80 p-2">
            <EnergyCoordinateChart
              result={simulation}
              progress={stageViewMode === 'pathway' ? pathwayProgress : 1}
            />
          </div>
        </div>

        {/* Section 4: Mass & Atom Conservation Verification Matrix */}
        <div className="p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              原子与质量守恒核验
            </h3>
            {simulation.isAtomBalanced && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                <Check className="w-3.5 h-3.5" />
                <span>质量守恒 ΣM = {totalStoichiometricMass.toFixed(2)} g/mol</span>
              </span>
            )}
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-1.5 text-left font-medium">元素</th>
                <th className="py-1.5 text-right font-medium">反应前原子数</th>
                <th className="py-1.5 text-right font-medium">反应后原子数</th>
                <th className="py-1.5 text-right font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
              {simulation.atomBalance.map((row) => {
                const el = ELEMENT_BY_SYMBOL[row.element];
                return (
                  <tr key={row.element}>
                    <td className="py-1.5 font-sans">
                      <span className="inline-flex items-center gap-1.5">
                        <svg
                          className="w-2.5 h-2.5 shrink-0"
                          viewBox="0 0 10 10"
                          aria-hidden="true"
                        >
                          <rect
                            width="10"
                            height="10"
                            rx="2"
                            fill={el?.cpkColor ?? '#94a3b8'}
                            stroke="rgba(255,255,255,0.22)"
                            strokeWidth="1"
                          />
                        </svg>
                        <span className="font-mono font-semibold text-white">
                          {row.element}
                        </span>
                        {el && (
                          <span className="text-slate-400">
                            {getSafeElementNameZh(el.number, el.nameZh).text}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-slate-200">
                      {row.reactantAtoms}
                    </td>
                    <td className="py-1.5 text-right text-slate-200">
                      {row.productAtoms}
                    </td>
                    <td className="py-1.5 text-right font-sans">
                      {row.balanced ? (
                        <span className="text-emerald-300 font-medium">✓ 守恒</span>
                      ) : (
                        <span className="text-rose-400 font-medium">未配平</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
});
