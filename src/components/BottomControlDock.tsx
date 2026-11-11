import React, { useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Play,
  Pause,
  Tag,
  Upload,
  Ruler,
  Hammer,
  Eye,
  Compass,
  Sparkles,
  Trash2,
  Plus,
} from 'lucide-react';
import {
  MOLECULE_CATEGORY_LABELS,
  MoleculeCategory,
  MoleculeModel,
} from '../chemistry/molecules';
import { ChemicalElement, ELEMENTS } from '../chemistry/elements';
import {
  QUANTUM_ORBITAL_LIST,
  QuantumOrbitalId,
} from '../chemistry/quantumOrbitals';
import {
  AtomViewMode,
  CameraPreset,
  MoleculeToolMode,
  RenderStyle,
  StageMode,
} from './ChemistryStage3D';

export type BuilderAction = 'add-atom' | 'connect-bond' | 'delete-atom';

interface BottomControlDockProps {
  stageMode: StageMode;
  atomViewMode: AtomViewMode;
  onChangeAtomViewMode: (mode: AtomViewMode) => void;
  quantumOrbitalId: QuantumOrbitalId;
  onChangeQuantumOrbitalId: (id: QuantumOrbitalId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  molecules: MoleculeModel[];
  selectedMolecule: MoleculeModel;
  onSelectMolecule: (mol: MoleculeModel) => void;
  moleculeCategoryFilter: MoleculeCategory | 'all';
  onChangeMoleculeCategory: (cat: MoleculeCategory | 'all') => void;
  onOpenImportModal: () => void;
  activeElement: ChemicalElement;
  onSelectElement: (el: ChemicalElement) => void;
  renderStyle: RenderStyle;
  onChangeRenderStyle: (style: RenderStyle) => void;
  showDipoleVector: boolean;
  onToggleDipoleVector: () => void;
  toolMode: MoleculeToolMode;
  onChangeToolMode: (mode: MoleculeToolMode) => void;
  measurementAtomIds: number[];
  onClearMeasurement: () => void;
  builderAction: BuilderAction;
  onChangeBuilderAction: (action: BuilderAction) => void;
  builderElement: string;
  onChangeBuilderElement: (symbol: string) => void;
  builderBondOrder: 'single' | 'double' | 'triple';
  onChangeBuilderBondOrder: (order: 'single' | 'double' | 'triple') => void;
  pendingConnectAtomId: number | null;
  onSaturateHydrogens: () => void;
  onNewSeedMolecule: () => void;
  explodeFactor: number;
  onChangeExplodeFactor: (val: number) => void;
  atomScale: number;
  onChangeAtomScale: (val: number) => void;
  showAtomLabels: boolean;
  onToggleAtomLabels: () => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
}

const FEATURED_ATOMIC_NUMBERS = [1, 6, 7, 8, 11, 14, 16, 17, 26, 29, 47, 79, 92];
const BUILDER_ELEMENTS = ['C', 'H', 'O', 'N', 'F', 'Cl', 'S', 'P'];

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  stageMode,
  atomViewMode,
  onChangeAtomViewMode,
  quantumOrbitalId,
  onChangeQuantumOrbitalId,
  collapsed,
  onToggleCollapsed,
  molecules,
  selectedMolecule,
  onSelectMolecule,
  moleculeCategoryFilter,
  onChangeMoleculeCategory,
  onOpenImportModal,
  activeElement,
  onSelectElement,
  renderStyle,
  onChangeRenderStyle,
  showDipoleVector,
  onToggleDipoleVector,
  toolMode,
  onChangeToolMode,
  measurementAtomIds,
  onClearMeasurement,
  builderAction,
  onChangeBuilderAction,
  builderElement,
  onChangeBuilderElement,
  builderBondOrder,
  onChangeBuilderBondOrder,
  pendingConnectAtomId,
  onSaturateHydrogens,
  onNewSeedMolecule,
  explodeFactor,
  onChangeExplodeFactor,
  atomScale,
  onChangeAtomScale,
  showAtomLabels,
  onToggleAtomLabels,
  autoRotate,
  onToggleAutoRotate,
  onCameraPreset,
}) => {
  // Keyboard shortcut 'H' to toggle Zen/Cinema dock collapse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') {
        onToggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleCollapsed]);

  const filteredMolecules =
    moleculeCategoryFilter === 'all'
      ? molecules
      : molecules.filter((m) => m.category === moleculeCategoryFilter);

  return (
    <div
      className="relative w-full px-3 py-2.5 bg-[#0B101B] border-t border-slate-800/90 lg:bg-transparent lg:border-t-0 lg:p-0 lg:pointer-events-none lg:absolute lg:bottom-3.5 lg:left-1/2 lg:-translate-x-1/2 z-20 lg:w-[min(960px,96%)] flex flex-col items-center"
      aria-label="三维视窗控制坞"
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#0E1525] border border-slate-700/80 rounded-t-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>展开控制栏 (H)</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            <span>隐藏控制栏 (H)</span>
          </>
        )}
      </button>

      {/* Main Dock Container — Solid RGBA without backdrop-filter per WebGL rule */}
      {!collapsed && (
        <div className="pointer-events-auto w-full rounded-xl bg-[#0E1525]/96 border border-slate-700/80 p-3 shadow-2xl space-y-2.5">
          {/* Top Strip: Molecule Switcher + Tool Mode OR Atom Mode + Orbital Picker */}
          {stageMode === 'molecule' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Category Filter + Import Button */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div
                    className="flex items-center gap-0.5 bg-[#090D16] p-0.5 rounded-lg border border-slate-800"
                    role="group"
                    aria-label="分子类别筛选"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeMoleculeCategory('all')}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        moleculeCategoryFilter === 'all'
                          ? 'bg-slate-800 text-cyan-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      全部 ({molecules.length})
                    </button>
                    {(Object.keys(MOLECULE_CATEGORY_LABELS) as MoleculeCategory[]).map(
                      (cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => onChangeMoleculeCategory(cat)}
                          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            moleculeCategoryFilter === cat
                              ? 'bg-slate-800 text-cyan-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {MOLECULE_CATEGORY_LABELS[cat]}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onOpenImportModal}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>导入 / PubChem</span>
                  </button>
                </div>

                {/* 3D Interactive Tool Mode Switch + Camera Presets */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="flex items-center gap-0.5 bg-[#090D16] p-0.5 rounded-lg border border-slate-800"
                    role="group"
                    aria-label="三维交互工具模式"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeToolMode('inspect')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        toolMode === 'inspect'
                          ? 'bg-cyan-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>观察检视</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeToolMode('measure')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        toolMode === 'measure'
                          ? 'bg-emerald-400 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Ruler className="w-3 h-3" />
                      <span>自由测距/二面角</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeToolMode('build')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        toolMode === 'build'
                          ? 'bg-amber-400 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Hammer className="w-3 h-3" />
                      <span>三维分子搭建</span>
                    </button>
                  </div>

                  {/* Camera View Presets */}
                  <div className="hidden sm:flex items-center gap-1" role="group" aria-label="相机预设视角">
                    {(
                      [
                        ['isometric', '等轴测'],
                        ['front', '正视'],
                        ['top', '俯视'],
                        ['side', '侧视'],
                      ] as [CameraPreset, string][]
                    ).map(([preset, label]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onCameraPreset(preset)}
                        className="px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#141E33] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onCameraPreset('reset')}
                      aria-label="重置三维视角"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#141E33] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>重置</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Molecule Selector Row */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {filteredMolecules.map((mol) => {
                  const active = mol.id === selectedMolecule.id;
                  return (
                    <button
                      key={mol.id}
                      type="button"
                      onClick={() => onSelectMolecule(mol)}
                      className={`px-2.5 py-1 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-400/70 text-white'
                          : 'bg-[#131C2E] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold">{mol.nameZh}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-cyan-300/90">
                        {mol.formulaDisplay}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Bohr vs Quantum Orbital Cloud Switch */}
                <div
                  className="flex items-center gap-1 bg-[#090D16] p-0.5 rounded-lg border border-slate-800"
                  role="group"
                  aria-label="原子三维可视化模式"
                >
                  <button
                    type="button"
                    onClick={() => onChangeAtomViewMode('bohr')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      atomViewMode === 'bohr'
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    玻尔壳层模型
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeAtomViewMode('quantum')}
                    className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      atomViewMode === 'quantum'
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>量子轨道电子云</span>
                  </button>
                </div>

                {/* Featured Elements Quick Strip */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[200px] overflow-hidden">
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    元素快选:
                  </span>
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                    {FEATURED_ATOMIC_NUMBERS.map((z) => {
                      const el = ELEMENTS[z - 1];
                      const active = el.number === activeElement.number;
                      return (
                        <button
                          key={el.number}
                          type="button"
                          onClick={() => onSelectElement(el)}
                          className={`px-2 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-cyan-500/18 border-cyan-400/70 text-white'
                              : 'bg-[#131C2E] border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <span className="font-mono text-[10px] text-slate-400 mr-1">
                            {el.number}
                          </span>
                          <span>
                            {el.symbol} {el.nameZh}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onCameraPreset('reset')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#141E33] border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重置视角</span>
                </button>
              </div>

              {/* Quantum Orbital Selector Strip when in quantum mode */}
              {atomViewMode === 'quantum' && (
                <div
                  className="flex items-center gap-1.5 overflow-hidden"
                  role="group"
                  aria-label="量子力学原子轨道与杂化轨道选择"
                >
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    轨道波函数:
                  </span>
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                    {QUANTUM_ORBITAL_LIST.map((orb) => {
                      const active = orb.id === quantumOrbitalId;
                      const isHybrid = orb.id.startsWith('sp');
                      return (
                        <button
                          key={orb.id}
                          type="button"
                          onClick={() => onChangeQuantumOrbitalId(orb.id)}
                          className={`px-2.5 py-1 rounded-md border font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                              : isHybrid
                                ? 'bg-[#161F33] border-indigo-500/35 text-indigo-200 hover:border-indigo-400'
                                : 'bg-[#131C2E] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                          }`}
                        >
                          {orb.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Controls Row: Mode-Specific Controls + Utility Toggles */}
          <div className="pt-2 border-t border-slate-800/90 flex items-center justify-between gap-3 flex-wrap">
            {stageMode === 'molecule' ? (
              toolMode === 'inspect' ? (
                <>
                  {/* 3D Representation Style (including Electrostatic Potential ESP) */}
                  <div
                    className="flex items-center gap-0.5 bg-[#090D16] p-0.5 rounded-lg border border-slate-800"
                    role="group"
                    aria-label="三维模型表现形式"
                  >
                    {(
                      [
                        ['ball-stick', '球棍模型'],
                        ['space-filling', '空间填充'],
                        ['esp', '静电势 ESP'],
                        ['wireframe', '共价线框'],
                      ] as [RenderStyle, string][]
                    ).map(([style, label]) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => onChangeRenderStyle(style)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          renderStyle === style
                            ? 'bg-cyan-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Labeled Sliders with Explicit Units */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap">
                      <span>键长解构:</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={2}
                        value={Math.round(explodeFactor * 100)}
                        onChange={(e) =>
                          onChangeExplodeFactor(Number(e.target.value) / 100)
                        }
                        aria-label="键长解构百分比"
                        className="w-20 accent-cyan-400 cursor-pointer"
                      />
                      <span className="font-mono tabular-nums text-cyan-300 w-9 text-right">
                        {Math.round(explodeFactor * 100)}%
                      </span>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap">
                      <span>原子比例:</span>
                      <input
                        type="range"
                        min={60}
                        max={140}
                        step={5}
                        value={Math.round(atomScale * 100)}
                        onChange={(e) =>
                          onChangeAtomScale(Number(e.target.value) / 100)
                        }
                        aria-label="原子半径比例"
                        className="w-20 accent-cyan-400 cursor-pointer"
                      />
                      <span className="font-mono tabular-nums text-cyan-300 w-10 text-right">
                        {Math.round(atomScale * 100)}%
                      </span>
                    </label>
                  </div>
                </>
              ) : toolMode === 'measure' ? (
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="text-emerald-300 font-medium">
                    几何测量尺：依次点击 2 个原子测距 (Å)、3 个测键角 (°)、4 个测二面角 (φ)
                  </span>
                  <span className="font-mono tabular-nums px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200">
                    已选 {measurementAtomIds.length} / 4 原子
                  </span>
                  {measurementAtomIds.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearMeasurement}
                      className="px-2.5 py-1 rounded-md bg-[#141E33] hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      清空测距选点
                    </button>
                  )}
                </div>
              ) : (
                /* 3D VSEPR Molecule Builder Controls */
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div
                    className="flex items-center gap-0.5 bg-[#090D16] p-0.5 rounded-lg border border-slate-800"
                    role="group"
                    aria-label="分子搭建操作类型"
                  >
                    {(
                      [
                        ['add-atom', '接枝原子'],
                        ['connect-bond', '连键/改键级'],
                        ['delete-atom', '删除原子'],
                      ] as [BuilderAction, string][]
                    ).map(([act, label]) => (
                      <button
                        key={act}
                        type="button"
                        onClick={() => onChangeBuilderAction(act)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          builderAction === act
                            ? act === 'delete-atom'
                              ? 'bg-rose-500 text-white font-semibold'
                              : 'bg-amber-400 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {builderAction === 'add-atom' && (
                    <div
                      className="flex items-center gap-1"
                      role="group"
                      aria-label="接枝元素选择"
                    >
                      {BUILDER_ELEMENTS.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => onChangeBuilderElement(sym)}
                          className={`w-7 h-7 rounded-md font-mono text-xs font-bold border transition-colors shrink-0 ${
                            builderElement === sym
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-[#131C2E] border-slate-800 text-slate-200 hover:border-slate-600'
                          }`}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  )}

                  {builderAction !== 'delete-atom' && (
                    <div
                      className="flex items-center gap-0.5 bg-[#090D16] p-0.5 rounded-lg border border-slate-800"
                      role="group"
                      aria-label="化学键级选择"
                    >
                      {(
                        [
                          ['single', '单键'],
                          ['double', '双键'],
                          ['triple', '叁键'],
                        ] as ['single' | 'double' | 'triple', string][]
                      ).map(([ord, label]) => (
                        <button
                          key={ord}
                          type="button"
                          onClick={() => onChangeBuilderBondOrder(ord)}
                          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            builderBondOrder === ord
                              ? 'bg-slate-700 text-amber-300 font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {builderAction === 'connect-bond' && pendingConnectAtomId !== null && (
                    <span className="text-xs font-mono text-amber-300 whitespace-nowrap">
                      起点 #{pendingConnectAtomId + 1} → 请点击目标原子
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onSaturateHydrogens}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>自动补氢</span>
                    </button>
                    <button
                      type="button"
                      onClick={onNewSeedMolecule}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#141E33] hover:bg-slate-800 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      {selectedMolecule.atoms.length <= 1 ? (
                        <Trash2 className="w-3 h-3" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      <span>新建碳骨架</span>
                    </button>
                  </div>
                </div>
              )
            ) : atomViewMode === 'bohr' ? (
              <div className="text-xs text-slate-300">
                <span>红色球体代表质子 (p⁺)</span>
                <span className="mx-2 text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span>灰蓝球体代表中子 (n⁰)</span>
                <span className="mx-2 text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-cyan-300">高亮青色外环代表最外层价电子壳层</span>
              </div>
            ) : (
              <div className="text-xs text-slate-300 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#38BDF8] inline-block" />
                  <span>正相位波函数瓣 (ψ &gt; 0)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#FB7185] inline-block" />
                  <span>负相位波函数瓣 (ψ &lt; 0)</span>
                </span>
                <span className="text-slate-400">
                  散点密度正比于电子出现概率密度 |ψ(r,θ,φ)|²
                </span>
              </div>
            )}

            {/* Utility Toggles */}
            <div className="flex items-center gap-1.5 ml-auto">
              {stageMode === 'molecule' && (
                <>
                  <button
                    type="button"
                    onClick={onToggleDipoleVector}
                    aria-pressed={showDipoleVector}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      showDipoleVector
                        ? 'bg-amber-500/18 border-amber-400/60 text-amber-200'
                        : 'bg-[#141E33] border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>偶极矢量</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleAtomLabels}
                    aria-pressed={showAtomLabels}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      showAtomLabels
                        ? 'bg-cyan-500/18 border-cyan-400/60 text-cyan-200'
                        : 'bg-[#141E33] border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>原子标签</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onToggleAutoRotate}
                aria-pressed={autoRotate}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  autoRotate
                    ? 'bg-cyan-500/18 border-cyan-400/60 text-cyan-200'
                    : 'bg-[#141E33] border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {autoRotate ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{autoRotate ? '暂停旋转' : '自动旋转'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
