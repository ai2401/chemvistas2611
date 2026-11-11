import React, { useMemo } from 'react';
import { Atom, Compass, Layers, Ruler, Sparkles, Zap } from 'lucide-react';
import {
  CATEGORY_META,
  ChemicalElement,
  PHASE_LABELS,
} from '../chemistry/elements';
import { BondOrder, MoleculeModel } from '../chemistry/molecules';
import {
  analyzeMoleculeComposition,
  formatKelvinWithCelsius,
  inspectAtomGeometry,
  measureAtomSelection,
} from '../chemistry/calculations';
import { computeMoleculeElectrostatics } from '../chemistry/electrostatics';
import {
  QUANTUM_ORBITAL_LIST,
  QUANTUM_ORBITAL_MAP,
  QuantumOrbitalId,
} from '../chemistry/quantumOrbitals';
import { getSafeElementNameZh } from '../utils/glyphSupport';
import {
  AtomViewMode,
  MoleculeToolMode,
  RenderStyle,
} from './ChemistryStage3D';

export type InspectorTab = 'element' | 'molecule';

interface ElementInspectorPanelProps {
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  activeElement: ChemicalElement;
  onSelectElement: (el: ChemicalElement) => void;
  molecules: MoleculeModel[];
  molecule: MoleculeModel;
  onSelectMolecule: (mol: MoleculeModel) => void;
  selectedAtomId: number | null;
  highlightedElementSymbol: string | null;
  onSelectAtom: (atomId: number | null, elementSymbol?: string) => void;
  onHighlightElementIn3D: (symbol: string | null) => void;
  onInspectElement3DAtom: (el: ChemicalElement) => void;
  onInspectElementQuantumOrbital: (el: ChemicalElement) => void;
  atomViewMode: AtomViewMode;
  quantumOrbitalId: QuantumOrbitalId;
  onChangeQuantumOrbitalId: (id: QuantumOrbitalId) => void;
  renderStyle: RenderStyle;
  onChangeRenderStyle: (style: RenderStyle) => void;
  showDipoleVector: boolean;
  onToggleDipoleVector: () => void;
  toolMode: MoleculeToolMode;
  onChangeToolMode: (mode: MoleculeToolMode) => void;
  measurementAtomIds: number[];
  onToggleMeasurementAtom: (atomId: number) => void;
  onClearMeasurement: () => void;
  showMoleculeTab: boolean;
}

const BOND_ORDER_LABELS: Record<BondOrder, string> = {
  single: '共价单键',
  double: '共价双键',
  triple: '共价叁键',
  aromatic: '芳香大π键',
  ionic: '离子配位',
};

const SHELL_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

const BohrShellSvg: React.FC<{ element: ChemicalElement }> = ({ element }) => {
  const size = 160;
  const center = size / 2;
  const shellCount = element.shells.length;
  const minR = 22;
  const maxR = 70;
  const step = shellCount > 1 ? (maxR - minR) / (shellCount - 1) : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 select-none"
      role="img"
      aria-label={`${element.nameZh}原子玻尔电子层示意图`}
    >
      {element.shells.map((count, idx) => {
        const r = shellCount === 1 ? 42 : minR + idx * step;
        const isValence = idx === shellCount - 1;
        return (
          <g key={idx}>
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={isValence ? '#22D3EE' : '#334155'}
              strokeWidth={isValence ? 1.3 : 1}
              strokeDasharray={isValence ? undefined : '2 2'}
            />
            {Array.from({ length: count }).map((_, eIdx) => {
              const theta = (eIdx * 2 * Math.PI) / count - Math.PI / 2;
              const ex = center + r * Math.cos(theta);
              const ey = center + r * Math.sin(theta);
              return (
                <circle
                  key={eIdx}
                  cx={ex}
                  cy={ey}
                  r={isValence ? 2.8 : 2.1}
                  fill={isValence ? '#38BDF8' : '#CBD5E1'}
                />
              );
            })}
          </g>
        );
      })}

      <circle
        cx={center}
        cy={center}
        r={13}
        fill="#151E2E"
        stroke={element.cpkColor}
        strokeWidth={2}
      />
      <text
        x={center}
        y={center + 4}
        textAnchor="middle"
        className="fill-slate-100 font-mono text-[11px] font-semibold"
      >
        {element.symbol}
      </text>
    </svg>
  );
};

export const ElementInspectorPanel: React.FC<ElementInspectorPanelProps> = ({
  activeTab,
  onChangeTab,
  activeElement,
  onSelectElement,
  molecules,
  molecule,
  onSelectMolecule,
  selectedAtomId,
  highlightedElementSymbol,
  onSelectAtom,
  onHighlightElementIn3D,
  onInspectElement3DAtom,
  onInspectElementQuantumOrbital,
  atomViewMode,
  quantumOrbitalId,
  onChangeQuantumOrbitalId,
  renderStyle,
  onChangeRenderStyle,
  showDipoleVector,
  onToggleDipoleVector,
  toolMode,
  onChangeToolMode,
  measurementAtomIds,
  onToggleMeasurementAtom,
  onClearMeasurement,
  showMoleculeTab,
}) => {
  const catMeta = CATEGORY_META[activeElement.category];
  const { molarMass, composition } = useMemo(
    () => analyzeMoleculeComposition(molecule),
    [molecule]
  );
  const electrostatics = useMemo(
    () => computeMoleculeElectrostatics(molecule),
    [molecule]
  );
  const multiMeasurement = useMemo(
    () => measureAtomSelection(molecule, measurementAtomIds),
    [molecule, measurementAtomIds]
  );

  const atomInspection =
    selectedAtomId !== null
      ? inspectAtomGeometry(molecule, selectedAtomId)
      : inspectAtomGeometry(molecule, molecule.atoms[0]?.id ?? 0);

  const selectedAtomChargeInfo = atomInspection
    ? electrostatics.atomMap.get(atomInspection.atom.id)
    : undefined;

  const relatedMolecules = molecules.filter((mol) =>
    mol.atoms.some((a) => a.element === activeElement.symbol)
  );

  const activeOrbitalMeta = QUANTUM_ORBITAL_MAP[quantumOrbitalId];
  const effectiveTab: InspectorTab = showMoleculeTab ? activeTab : 'element';
  const safeActiveNameZh = getSafeElementNameZh(
    activeElement.number,
    activeElement.nameZh
  );

  return (
    <aside
      aria-label="元素与化学结构属性面板"
      className="w-full lg:w-[400px] xl:w-[420px] shrink-0 lg:h-full bg-[#0D1320] border-t lg:border-t-0 lg:border-l border-slate-800/90 flex flex-col lg:overflow-hidden"
    >
      {/* Segmented Inspector Tabs */}
      {showMoleculeTab && (
        <div className="px-5 pt-4 pb-3 border-b border-slate-800/90 bg-[#0B101B]">
          <div
            className="grid grid-cols-2 gap-1 p-1 bg-[#131C2E] rounded-lg border border-slate-800"
            role="tablist"
            aria-label="属性查看器视图切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'element'}
              onClick={() => onChangeTab('element')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                effectiveTab === 'element'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Atom className="w-3.5 h-3.5" />
              <span>元素属性 ({activeElement.symbol})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'molecule'}
              onClick={() => onChangeTab('molecule')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                effectiveTab === 'molecule'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="truncate">分子与极性 ({molecule.nameZh})</span>
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {effectiveTab === 'element' ? (
          <>
            {/* Element Header & Identity Tile */}
            <section className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className="w-[72px] min-h-[76px] rounded-xl bg-[#131C2E] border border-slate-700/80 flex flex-col justify-between p-2.5 shrink-0"
                  aria-hidden="true"
                >
                  <div className="flex items-center justify-between leading-none">
                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {activeElement.number}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: activeElement.cpkColor }}
                    />
                  </div>
                  <div className="text-xl font-bold tracking-tight text-white leading-tight my-0.5">
                    {activeElement.symbol}
                  </div>
                  <div className="font-mono tabular-nums text-[10px] leading-tight text-slate-300 truncate">
                    {activeElement.atomicMass}
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      {safeActiveNameZh.supported ? (
                        safeActiveNameZh.text
                      ) : (
                        <span className="inline-flex items-baseline tracking-[-0.08em]">
                          {safeActiveNameZh.text}
                        </span>
                      )}
                    </h2>
                    <span className="text-sm text-slate-400">
                      ({activeElement.pinyin})
                    </span>
                    <span className="text-sm font-medium text-slate-300">
                      {activeElement.nameEn}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center flex-wrap gap-1.5 text-xs text-slate-400">
                    <span className={catMeta.textClass}>{catMeta.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>第 {activeElement.period} 周期</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {activeElement.group ? `第 ${activeElement.group} 族` : 'f区副族内过渡'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{activeElement.block} 区</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Summary Prose */}
            <p className="text-sm leading-relaxed text-slate-300">
              {activeElement.summary}
            </p>

            {/* 2D Bohr Shell Diagram + 3D Bohr / Quantum Cloud Jumps */}
            <section className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-100">
                  电子壳层与量子轨道波函数
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onInspectElement3DAtom(activeElement)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white bg-[#131C2E] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Compass className="w-3.5 h-3.5 text-cyan-400" />
                    <span>三维壳层</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspectElementQuantumOrbital(activeElement)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:text-white bg-cyan-500/14 hover:bg-cyan-500/24 border border-cyan-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>查看量子电子云</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3.5 bg-[#111929] border border-slate-800/90 rounded-xl p-3">
                <BohrShellSvg element={activeElement} />
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div>
                    <div className="text-xs text-slate-400">基态电子构型</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-cyan-300 break-words">
                      {activeElement.electronConfig}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400">各电子层电子数</div>
                    <div className="mt-1 grid grid-cols-4 gap-1.5">
                      {activeElement.shells.map((cnt, sIdx) => (
                        <div
                          key={sIdx}
                          className="px-2 py-1 rounded bg-[#0B101B] border border-slate-800 text-center"
                        >
                          <div className="font-mono text-[10px] text-slate-400">
                            {SHELL_LETTERS[sIdx]}层
                          </div>
                          <div className="font-mono tabular-nums text-xs font-semibold text-slate-100">
                            {cnt}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quantum Orbital Wavefunction Card */}
              {activeOrbitalMeta && (
                <div className="rounded-xl bg-[#111929] border border-slate-800/90 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {activeOrbitalMeta.subshellTitle}
                    </span>
                    <span className="font-mono text-[11px] text-cyan-300">
                      {activeOrbitalMeta.quantumNumbers}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    节面特征：<span className="text-slate-200">{activeOrbitalMeta.nodalSummary}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300">
                    {activeOrbitalMeta.description}
                  </p>
                  {!showMoleculeTab && atomViewMode === 'quantum' && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {QUANTUM_ORBITAL_LIST.map((orb) => (
                        <button
                          key={orb.id}
                          type="button"
                          onClick={() => onChangeQuantumOrbitalId(orb.id)}
                          className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                            orb.id === quantumOrbitalId
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                              : 'bg-[#0B101B] border-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {orb.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Core Atomic & Electronic Parameters */}
            <section className="pt-4 border-t border-slate-800/80 space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">
                原子与成键核心参数
              </h3>
              <dl className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                  <dt className="text-xs text-slate-400">相对原子质量</dt>
                  <dd className="mt-1 font-mono tabular-nums text-lg font-semibold text-white">
                    {activeElement.atomicMass}
                    <span className="ml-1 text-xs font-normal text-slate-400">u</span>
                  </dd>
                </div>

                <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                  <dt className="text-xs text-slate-400">鲍林电负性 (χ)</dt>
                  <dd className="mt-1 font-mono tabular-nums text-lg font-semibold text-white">
                    {activeElement.electronegativity !== null
                      ? activeElement.electronegativity.toFixed(2)
                      : '—'}
                  </dd>
                </div>

                <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                  <dt className="text-xs text-slate-400">共价半径</dt>
                  <dd className="mt-1 font-mono tabular-nums text-lg font-semibold text-white">
                    {activeElement.covalentRadius}
                    <span className="ml-1 text-xs font-normal text-slate-400">pm</span>
                  </dd>
                </div>

                <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                  <dt className="text-xs text-slate-400">范德华半径</dt>
                  <dd className="mt-1 font-mono tabular-nums text-lg font-semibold text-white">
                    {activeElement.vdwRadius}
                    <span className="ml-1 text-xs font-normal text-slate-400">pm</span>
                  </dd>
                </div>

                <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                  <dt className="text-xs text-slate-400">第一电离能</dt>
                  <dd className="mt-1 font-mono tabular-nums text-base font-semibold text-white">
                    {activeElement.ionizationEnergy !== null ? (
                      <>
                        {activeElement.ionizationEnergy}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          kJ/mol
                        </span>
                      </>
                    ) : (
                      '暂无实测'
                    )}
                  </dd>
                </div>

                <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                  <dt className="text-xs text-slate-400">常见氧化态</dt>
                  <dd className="mt-1 font-mono tabular-nums text-sm font-semibold text-cyan-300">
                    {activeElement.oxidationStates}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Physical & Thermodynamic Properties */}
            <section className="pt-4 border-t border-slate-800/80 space-y-2">
              <h3 className="text-sm font-semibold text-slate-100">
                热力学与宏观物理常数
              </h3>
              <dl className="divide-y divide-slate-800/80 text-xs">
                <div className="py-2 flex items-center justify-between gap-4">
                  <dt className="text-slate-400">标准状态物态</dt>
                  <dd className="font-medium text-slate-100">
                    {PHASE_LABELS[activeElement.phase]}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between gap-4">
                  <dt className="text-slate-400">标准密度</dt>
                  <dd className="font-mono tabular-nums text-slate-100">
                    {activeElement.density !== null
                      ? `${activeElement.density} g/cm³`
                      : '暂无实测数据'}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between gap-4">
                  <dt className="text-slate-400">熔点</dt>
                  <dd className="font-mono tabular-nums text-slate-100">
                    {formatKelvinWithCelsius(activeElement.meltingPoint)}
                  </dd>
                </div>
                <div className="py-2 flex items-center justify-between gap-4">
                  <dt className="text-slate-400">沸点</dt>
                  <dd className="font-mono tabular-nums text-slate-100">
                    {formatKelvinWithCelsius(activeElement.boilingPoint)}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Related 3D Molecules containing this Element */}
            {relatedMolecules.length > 0 && (
              <section className="pt-4 border-t border-slate-800/80 space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-100">
                  含 {activeElement.nameZh} ({activeElement.symbol}) 的三维模型
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {relatedMolecules.map((mol) => (
                    <button
                      key={mol.id}
                      type="button"
                      onClick={() => onSelectMolecule(mol)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap ${
                        mol.id === molecule.id && showMoleculeTab
                          ? 'bg-cyan-500/16 border-cyan-400/60 text-white'
                          : 'bg-[#111929] border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      <span>{mol.nameZh}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-cyan-300">
                        {mol.formulaDisplay}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          /* Molecule Structure, ESP Electrostatics, Geometry Ruler & Composition Tab */
          <>
            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {molecule.nameZh}
                </h2>
                <span className="font-mono text-sm font-semibold text-cyan-300">
                  {molecule.formulaDisplay}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-300">
                {molecule.description}
              </p>
            </section>

            {/* Molecular Metrics Grid */}
            <section className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                <div className="text-xs text-slate-400">摩尔质量</div>
                <div className="mt-1 font-mono tabular-nums text-base font-semibold text-white">
                  {molarMass}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    g/mol
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                <div className="text-xs text-slate-400">原子总数</div>
                <div className="mt-1 font-mono tabular-nums text-base font-semibold text-white">
                  {molecule.atoms.length}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80">
                <div className="text-xs text-slate-400">化学键数</div>
                <div className="mt-1 font-mono tabular-nums text-base font-semibold text-white">
                  {molecule.bonds.length}
                </div>
              </div>
            </section>

            {/* Electrostatics (ESP) & Net Molecular Dipole Vector Section */}
            <section className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>分子极性与静电势 (ESP)</span>
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeRenderStyle(
                        renderStyle === 'esp' ? 'ball-stick' : 'esp'
                      )
                    }
                    aria-pressed={renderStyle === 'esp'}
                    className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                      renderStyle === 'esp'
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                        : 'bg-[#111929] border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {renderStyle === 'esp' ? 'ESP 着色中' : '开启 ESP 着色'}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleDipoleVector}
                    aria-pressed={showDipoleVector}
                    className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                      showDipoleVector
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-semibold'
                        : 'bg-[#111929] border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {showDipoleVector ? '隐藏偶极矩' : '显示偶极矢量'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-[#111929] border border-slate-800/90 p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">三维电负性推演净偶极矩 |μ|</span>
                  <span className="font-mono tabular-nums font-semibold text-amber-300">
                    {electrostatics.dipoleMagnitudeDebye.toFixed(2)} D{' '}
                    <span className="text-slate-400 font-normal">
                      ({electrostatics.dipoleMagnitudeDebye < 0.06 ? '非极性对称抵消' : '极性分子 +→δ⁻'})
                    </span>
                  </span>
                </div>

                {selectedAtomChargeInfo && atomInspection && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">
                      当前选中原子 (#{atomInspection.atom.id + 1} {atomInspection.element.symbol}) 局部电荷
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-cyan-300">
                      {selectedAtomChargeInfo.partialCharge >= 0 ? '+' : ''}
                      {selectedAtomChargeInfo.partialCharge.toFixed(3)} e
                    </span>
                  </div>
                )}

                {/* ESP Color Scale Legend with explicit δ⁻ / 0 / δ⁺ labels */}
                <div className="pt-1 space-y-1">
                  <div className="h-2 w-full rounded-full bg-gradient-to-r from-[#EF4444] via-[#E2E8F0] to-[#2563EB]" />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span className="text-rose-400">富电子负电势 (δ⁻ 红)</span>
                    <span>中性 (0 白)</span>
                    <span className="text-blue-400">缺电子正电势 (δ⁺ 蓝)</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Free Multi-Atom Geometry Ruler (Distance / Angle / Dihedral Torsion) */}
            <section className="pt-4 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-emerald-400" />
                  <span>自由几何测量尺 (距离 / 键角 / 二面角)</span>
                </h3>
                <div className="flex items-center gap-1.5">
                  {measurementAtomIds.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearMeasurement}
                      className="text-xs text-slate-400 hover:text-white whitespace-nowrap"
                    >
                      清空
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onChangeToolMode(
                        toolMode === 'measure' ? 'inspect' : 'measure'
                      )
                    }
                    aria-pressed={toolMode === 'measure'}
                    className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                      toolMode === 'measure'
                        ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-semibold'
                        : 'bg-[#111929] border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {toolMode === 'measure' ? '画布点选测距中' : '开启画布测距'}
                  </button>
                </div>
              </div>

              {/* Accessible Multi-Atom Selection Chips */}
              <div
                className="flex items-center gap-1 overflow-x-auto pb-1"
                role="group"
                aria-label="依次点选2至4个原子测量空间距离、键角与二面角"
              >
                {molecule.atoms.slice(0, 20).map((at) => {
                  const orderIdx = measurementAtomIds.indexOf(at.id);
                  const isPicked = orderIdx !== -1;
                  return (
                    <button
                      key={at.id}
                      type="button"
                      onClick={() => onToggleMeasurementAtom(at.id)}
                      className={`px-2 py-1 rounded font-mono text-[11px] border transition-colors whitespace-nowrap shrink-0 ${
                        isPicked
                          ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-bold'
                          : 'bg-[#111929] border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {isPicked ? `(${orderIdx + 1}) ` : ''}
                      {at.element}
                      {at.id + 1}
                    </button>
                  );
                })}
              </div>

              {multiMeasurement.atoms.length < 2 ? (
                <div className="text-xs text-slate-400 bg-[#111929] border border-slate-800/80 rounded-lg p-2.5">
                  依次点选上方或三维画布中的 2–4 个原子，即可实测任意非键/成键核间距 (Å)、三原子夹角 (°) 与四原子扭转二面角 (φ)。
                </div>
              ) : (
                <div className="rounded-lg bg-[#111929] border border-emerald-500/35 p-2.5 space-y-1.5 text-xs">
                  {multiMeasurement.distanceAB && (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">
                        核间距 {multiMeasurement.distanceAB.label}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-emerald-300">
                        {multiMeasurement.distanceAB.angstrom.toFixed(3)} Å
                      </span>
                    </div>
                  )}
                  {multiMeasurement.angleABC && (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">
                        三原子角 {multiMeasurement.angleABC.label}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-emerald-300">
                        {multiMeasurement.angleABC.degrees.toFixed(1)}°
                      </span>
                    </div>
                  )}
                  {multiMeasurement.dihedralABCD && (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">
                        二面角 {multiMeasurement.dihedralABCD.label}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-amber-300">
                        {multiMeasurement.dihedralABCD.degrees.toFixed(1)}°
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Symmetry & Hybridization Specs */}
            <section className="pt-4 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div className="py-1 flex items-start justify-between gap-4">
                <span className="text-slate-400 shrink-0">空间几何构型</span>
                <span className="text-slate-100 text-right font-medium">
                  {molecule.geometry}
                </span>
              </div>
              <div className="py-1 flex items-start justify-between gap-4">
                <span className="text-slate-400 shrink-0">轨道杂化方式</span>
                <span className="text-slate-100 text-right font-medium">
                  {molecule.hybridization}
                </span>
              </div>
              <div className="py-1 flex items-start justify-between gap-4">
                <span className="text-slate-400 shrink-0">分子点群/空间群</span>
                <span className="font-mono text-slate-100 text-right">
                  {molecule.symmetry}
                </span>
              </div>
              <div className="py-1 flex items-start justify-between gap-4">
                <span className="text-slate-400 shrink-0">实验参考偶极矩</span>
                <span className="font-mono tabular-nums text-slate-100 text-right">
                  {molecule.dipoleMoment}
                </span>
              </div>
              <div className="py-1 flex items-start justify-between gap-4">
                <span className="text-slate-400 shrink-0">典型键角特征</span>
                <span className="font-mono text-cyan-300 text-right">
                  {molecule.bondAngleSummary}
                </span>
              </div>
            </section>

            {/* Interactive Mass Composition Bar & Element Selector */}
            <section className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  组成元素质量占比 (点击高亮元素)
                </h3>
                {highlightedElementSymbol && (
                  <button
                    type="button"
                    onClick={() => onHighlightElementIn3D(null)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                  >
                    取消高亮
                  </button>
                )}
              </div>

              <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-[#111929] border border-slate-800">
                {composition.map((item) => (
                  <div
                    key={item.element.symbol}
                    style={{
                      width: `${Math.max(item.massPercent, 3)}%`,
                      backgroundColor: item.element.cpkColor,
                    }}
                    title={`${item.element.nameZh}: ${item.massPercent}%`}
                  />
                ))}
              </div>

              <div className="space-y-1.5">
                {composition.map((item) => {
                  const isHighlighted =
                    highlightedElementSymbol === item.element.symbol;
                  return (
                    <div
                      key={item.element.symbol}
                      className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${
                        isHighlighted
                          ? 'bg-amber-500/12 border-amber-400/50'
                          : 'bg-[#111929] border-slate-800/80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectElement(item.element);
                          onHighlightElementIn3D(
                            isHighlighted ? null : item.element.symbol
                          );
                        }}
                        className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                      >
                        <span
                          className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
                          style={{ backgroundColor: item.element.cpkColor }}
                        />
                        <span className="text-xs font-semibold text-white">
                          {item.element.symbol} · {item.element.nameZh}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-slate-400">
                          ×{item.count}
                        </span>
                      </button>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono tabular-nums text-xs text-slate-200">
                          {item.massPercent.toFixed(2)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectElement(item.element);
                            onChangeTab('element');
                          }}
                          className="text-xs font-medium text-cyan-400 hover:text-cyan-200 whitespace-nowrap"
                        >
                          查看属性
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Selected Atom Coordination, Bond Lengths & Bond Angles */}
            {atomInspection && (
              <section className="pt-4 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    单原子配位键长与键角 (#{atomInspection.atom.id + 1}{' '}
                    {atomInspection.element.symbol} · {atomInspection.element.nameZh})
                  </h3>
                  <span className="font-mono tabular-nums text-xs text-slate-400">
                    配位数 {atomInspection.coordinationNumber}
                  </span>
                </div>

                <div
                  className="flex items-center gap-1 overflow-x-auto pb-1"
                  role="group"
                  aria-label="选择分子中的原子查看配位键长键角"
                >
                  {molecule.atoms.slice(0, 18).map((at) => {
                    const isPicked = atomInspection.atom.id === at.id;
                    return (
                      <button
                        key={at.id}
                        type="button"
                        onClick={() => onSelectAtom(at.id, at.element)}
                        className={`px-2 py-1 rounded font-mono text-[11px] border transition-colors whitespace-nowrap shrink-0 ${
                          isPicked
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                            : 'bg-[#111929] border-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {at.element}
                        {at.id + 1}
                      </button>
                    );
                  })}
                </div>

                {atomInspection.bonds.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">连接化学键与键长</div>
                    {atomInspection.bonds.map((b, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded bg-[#111929] border border-slate-800/70 text-xs"
                      >
                        <span className="font-mono text-slate-200">
                          {atomInspection.atom.element}
                          {atomInspection.atom.id + 1} — {b.neighborElement}
                          {b.neighborAtomId + 1}
                          <span className="ml-2 font-sans text-slate-400">
                            ({BOND_ORDER_LABELS[b.order]})
                          </span>
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-cyan-300">
                          {b.lengthAngstrom.toFixed(3)} Å
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {atomInspection.angles.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">中心键角实测值</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {atomInspection.angles.map((ang, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1.5 px-2.5 rounded bg-[#111929] border border-slate-800/70 text-xs"
                        >
                          <span className="font-mono text-slate-300 truncate mr-1">
                            {ang.label}
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-emerald-300 shrink-0">
                            {ang.angleDeg.toFixed(1)}°
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
