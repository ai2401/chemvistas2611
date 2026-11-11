import React, { useMemo, useState } from 'react';
import { Search, Thermometer, X } from 'lucide-react';
import {
  CATEGORY_META,
  ChemicalElement,
  ELEMENTS,
  ElementCategory,
} from '../chemistry/elements';
import {
  filterElements,
  getElementPhaseAtTemperature,
  SimulatedPhase,
} from '../chemistry/calculations';
import { getSafeElementNameZh } from '../utils/glyphSupport';
import { PeriodicTrendChart } from './PeriodicTrendChart';

export type PeriodicColorMode =
  | 'category'
  | 'electronegativity'
  | 'radius'
  | 'ionization'
  | 'phase-temp';

interface PeriodicTableViewProps {
  activeElement: ChemicalElement;
  onSelectElement: (el: ChemicalElement) => void;
  onInspectElement3DAtom: (el: ChemicalElement) => void;
}

const TEMP_PRESETS: { kelvin: number; label: string }[] = [
  { kelvin: 4, label: '4 K 液氦超低温' },
  { kelvin: 77, label: '77 K 液氮' },
  { kelvin: 298, label: '298 K 标准室温' },
  { kelvin: 373, label: '373 K 沸水' },
  { kelvin: 1850, label: '1850 K 炼钢高温' },
  { kelvin: 3600, label: '3600 K 钨丝白炽' },
  { kelvin: 5800, label: '5800 K 太阳表面' },
];

const PHASE_VISUAL: Record<
  SimulatedPhase,
  { badge: string; borderColor: string; bgColor: string }
> = {
  solid: {
    badge: '固',
    borderColor: 'rgba(56, 189, 248, 0.52)',
    bgColor: 'rgba(14, 116, 144, 0.20)',
  },
  liquid: {
    badge: '液',
    borderColor: 'rgba(52, 211, 153, 0.78)',
    bgColor: 'rgba(16, 185, 129, 0.30)',
  },
  gas: {
    badge: '气',
    borderColor: 'rgba(251, 191, 36, 0.68)',
    bgColor: 'rgba(245, 158, 11, 0.24)',
  },
  unknown: {
    badge: '—',
    borderColor: 'rgba(51, 65, 85, 0.55)',
    bgColor: 'rgba(15, 23, 42, 0.55)',
  },
};

function getHeatmapStyle(
  el: ChemicalElement,
  mode: PeriodicColorMode,
  kelvin: number
): { borderColor: string; bgColor: string; metricText: string; phaseBadge?: string } {
  if (mode === 'category') {
    const meta = CATEGORY_META[el.category];
    return {
      borderColor: `${meta.color}66`,
      bgColor: `${meta.color}16`,
      metricText: String(el.atomicMass),
    };
  }

  if (mode === 'phase-temp') {
    const ph = getElementPhaseAtTemperature(el, kelvin);
    const vis = PHASE_VISUAL[ph];
    const mpStr = el.meltingPoint !== null ? `${Math.round(el.meltingPoint)}K` : '待测';
    return {
      borderColor: vis.borderColor,
      bgColor: vis.bgColor,
      metricText: `${vis.badge} · ${mpStr}`,
      phaseBadge: vis.badge,
    };
  }

  if (mode === 'electronegativity') {
    if (el.electronegativity === null) {
      return {
        borderColor: 'rgba(51, 65, 85, 0.6)',
        bgColor: 'rgba(15, 23, 42, 0.6)',
        metricText: '—',
      };
    }
    const t = Math.max(0, Math.min(1, (el.electronegativity - 0.75) / 3.25));
    const alpha = (0.12 + t * 0.48).toFixed(2);
    return {
      borderColor: `rgba(34, 211, 238, ${Math.min(0.85, 0.25 + t * 0.6).toFixed(2)})`,
      bgColor: `rgba(6, 182, 212, ${alpha})`,
      metricText: el.electronegativity.toFixed(2),
    };
  }

  if (mode === 'radius') {
    const t = Math.max(0, Math.min(1, (el.covalentRadius - 28) / 232));
    const alpha = (0.12 + t * 0.48).toFixed(2);
    return {
      borderColor: `rgba(251, 191, 36, ${Math.min(0.85, 0.25 + t * 0.6).toFixed(2)})`,
      bgColor: `rgba(245, 158, 11, ${alpha})`,
      metricText: `${el.covalentRadius}pm`,
    };
  }

  // ionization
  if (el.ionizationEnergy === null) {
    return {
      borderColor: 'rgba(51, 65, 85, 0.6)',
      bgColor: 'rgba(15, 23, 42, 0.6)',
      metricText: '—',
    };
  }
  const t = Math.max(0, Math.min(1, (el.ionizationEnergy - 370) / 2010));
  const alpha = (0.12 + t * 0.48).toFixed(2);
  return {
    borderColor: `rgba(167, 139, 250, ${Math.min(0.85, 0.25 + t * 0.6).toFixed(2)})`,
    bgColor: `rgba(139, 92, 246, ${alpha})`,
    metricText: `${el.ionizationEnergy}`,
  };
}

export const PeriodicTableView: React.FC<PeriodicTableViewProps> = ({
  activeElement,
  onSelectElement,
  onInspectElement3DAtom,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ElementCategory | 'all'>('all');
  const [colorMode, setColorMode] = useState<PeriodicColorMode>('category');
  const [simulatedKelvin, setSimulatedKelvin] = useState<number>(298);

  const matches = useMemo(
    () => filterElements(searchQuery, categoryFilter, ELEMENTS),
    [searchQuery, categoryFilter]
  );

  const matchedSet = useMemo(
    () => new Set(matches.map((e) => e.number)),
    [matches]
  );

  const phaseCounts = useMemo(() => {
    const counts = { solid: 0, liquid: 0, gas: 0, unknown: 0 };
    for (const el of ELEMENTS) {
      counts[getElementPhaseAtTemperature(el, simulatedKelvin)]++;
    }
    return counts;
  }, [simulatedKelvin]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    const trimmed = val.trim();
    if (!trimmed) return;
    const nextMatches = filterElements(trimmed, categoryFilter, ELEMENTS);
    if (nextMatches.length === 1) {
      onSelectElement(nextMatches[0]);
    } else {
      const exact = nextMatches.find(
        (el) =>
          el.symbol.toLowerCase() === trimmed.toLowerCase() ||
          el.nameZh === trimmed ||
          String(el.number) === trimmed
      );
      if (exact) onSelectElement(exact);
    }
  };

  const cellMap = useMemo(() => {
    const map = new Map<string, ChemicalElement>();
    for (const el of ELEMENTS) {
      map.set(`${el.gridRow}-${el.gridCol}`, el);
    }
    return map;
  }, []);

  const celsius = simulatedKelvin - 273.15;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#090D16] p-5 lg:p-6 space-y-5">
      {/* Header & Interactive Search / Filter Controls */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              IUPAC 118种化学元素交互周期表
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              <span>点击任意元素检视构型与常数</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>支持 0–6000 K 温度物态模拟与周期律折线图联动</span>
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search Box with accessible label */}
            <div className="relative">
              <label htmlFor="periodic-element-search" className="sr-only">
                搜索化学元素
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="periodic-element-search"
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches.length > 0) {
                    onSelectElement(matches[0]);
                  }
                }}
                placeholder="搜元素名、符号、拼音或序数..."
                className="w-56 pl-9 pr-8 py-1.5 text-xs bg-[#111929] border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="清空元素搜索"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Heatmap & Temperature Phase Coloring Mode */}
            <div
              className="flex items-center gap-1 p-0.5 bg-[#111929] border border-slate-800 rounded-lg flex-wrap"
              role="group"
              aria-label="周期律热力图着色模式"
            >
              {(
                [
                  ['category', '族类分区'],
                  ['electronegativity', '电负性'],
                  ['radius', '共价半径'],
                  ['ionization', '电离能'],
                  ['phase-temp', '温度物态'],
                ] as [PeriodicColorMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setColorMode(mode)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    colorMode === mode
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Temperature Phase Simulator Bar (0 K - 6000 K) */}
        <div className="rounded-xl bg-[#0E1525] border border-slate-800/90 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs font-semibold text-white">
                1 atm 温度物态模拟器：
              </span>
              <span className="font-mono tabular-nums text-xs font-semibold text-cyan-300">
                {simulatedKelvin} K ({celsius >= 0 ? '+' : ''}
                {celsius.toFixed(1)} °C)
              </span>
            </div>

            {/* Explicit Text + Color Phase Breakdown (Zero Hue-Only Signaling) */}
            <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap">
              <span className="font-mono tabular-nums text-sky-300">
                固 固态 {phaseCounts.solid}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-emerald-300">
                液 液态 {phaseCounts.liquid}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-amber-300">
                气 气态 {phaseCounts.gas}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-400">
                待测 {phaseCounts.unknown}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label htmlFor="periodic-temp-slider" className="sr-only">
              模拟温度（开尔文 K）
            </label>
            <input
              id="periodic-temp-slider"
              type="range"
              min={0}
              max={6000}
              step={5}
              value={simulatedKelvin}
              onChange={(e) => {
                setSimulatedKelvin(Number(e.target.value));
                if (colorMode !== 'phase-temp') {
                  setColorMode('phase-temp');
                }
              }}
              className="flex-1 min-w-[200px] accent-cyan-400 cursor-pointer"
            />

            <div className="flex items-center gap-1 flex-wrap">
              {TEMP_PRESETS.map((preset) => (
                <button
                  key={preset.kelvin}
                  type="button"
                  onClick={() => {
                    setSimulatedKelvin(preset.kelvin);
                    setColorMode('phase-temp');
                  }}
                  className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                    colorMode === 'phase-temp' && simulatedKelvin === preset.kelvin
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#131C2E] border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category Filter Bar */}
        <div
          className="flex items-center gap-1.5 flex-wrap"
          role="group"
          aria-label="按元素化学类别筛选"
        >
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              categoryFilter === 'all'
                ? 'bg-slate-800 border-cyan-400/60 text-white'
                : 'bg-[#111929] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            全部元素 (118)
          </button>
          {(Object.keys(CATEGORY_META) as ElementCategory[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(active ? 'all' : cat)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-800 border-cyan-400 text-white'
                    : 'bg-[#111929] border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-xs"
                  style={{ backgroundColor: meta.color }}
                />
                <span>{meta.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty Search Result Banner */}
      {matchedSet.size === 0 && (
        <div className="p-4 rounded-xl bg-[#111929] border border-slate-800 text-center">
          <p className="text-sm text-slate-300">
            未找到匹配“{searchQuery}”的元素，请尝试输入元素中文名（如“金”）、化学符号（如“Au”）或原子序数（1–118）。
          </p>
        </div>
      )}

      {/* 18-Column Standard IUPAC Periodic Table Grid */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[920px] space-y-3">
          {/* Group Column Headers 1..18 */}
          <div className="grid grid-cols-18 gap-1">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((groupNum) => (
              <div
                key={groupNum}
                className="text-center font-mono text-[11px] text-slate-500 pb-0.5"
              >
                {groupNum}
              </div>
            ))}
          </div>

          {/* Main Periods 1..7 */}
          <div className="space-y-1">
            {[1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div key={row} className="grid grid-cols-18 gap-1">
                {Array.from({ length: 18 }, (_, idx) => idx + 1).map((col) => {
                  if (row === 6 && col === 3) {
                    return (
                      <div
                        key="lanth-marker"
                        className="h-14 rounded-md border border-purple-500/30 bg-purple-500/8 flex flex-col items-center justify-center p-1 text-center"
                      >
                        <span className="font-mono text-[10px] text-purple-300">
                          57–71
                        </span>
                        <span className="text-[11px] font-medium text-purple-200">
                          镧系
                        </span>
                      </div>
                    );
                  }
                  if (row === 7 && col === 3) {
                    return (
                      <div
                        key="act-marker"
                        className="h-14 rounded-md border border-pink-500/30 bg-pink-500/8 flex flex-col items-center justify-center p-1 text-center"
                      >
                        <span className="font-mono text-[10px] text-pink-300">
                          89–103
                        </span>
                        <span className="text-[11px] font-medium text-pink-200">
                          锕系
                        </span>
                      </div>
                    );
                  }

                  const el = cellMap.get(`${row}-${col}`);
                  if (!el) {
                    return <div key={`empty-${row}-${col}`} className="h-14" />;
                  }

                  const isSelected = el.number === activeElement.number;
                  const isMatched = matchedSet.has(el.number);
                  const styleSpec = getHeatmapStyle(el, colorMode, simulatedKelvin);
                  const safeZh = getSafeElementNameZh(el.number, el.nameZh);

                  return (
                    <button
                      key={el.number}
                      type="button"
                      onClick={() => onSelectElement(el)}
                      onDoubleClick={() => onInspectElement3DAtom(el)}
                      aria-label={`${el.number}号元素 ${safeZh.text} ${el.symbol}`}
                      style={{
                        borderColor: isSelected ? '#22D3EE' : styleSpec.borderColor,
                        backgroundColor: isSelected
                          ? 'rgba(6, 182, 212, 0.28)'
                          : styleSpec.bgColor,
                      }}
                      className={`h-14 rounded-md border p-1 flex flex-col justify-between text-left transition-opacity focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                        isMatched ? 'opacity-100 hover:brightness-125' : 'opacity-20'
                      } ${isSelected ? 'ring-1 ring-cyan-400' : ''}`}
                    >
                      <div className="flex items-center justify-between w-full leading-none">
                        <span className="font-mono tabular-nums text-[10px] text-slate-300">
                          {el.number}
                        </span>
                        <span
                          className={`text-[10px] font-medium text-slate-200 truncate ${
                            safeZh.supported ? '' : 'tracking-[-0.1em]'
                          }`}
                        >
                          {safeZh.text}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white leading-none">
                        {el.symbol}
                      </div>
                      <div className="font-mono tabular-nums text-[9px] text-slate-300 truncate leading-none">
                        {styleSpec.metricText}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* F-Block Rows: Lanthanides (gridRow 9) & Actinides (gridRow 10) */}
          <div className="pt-2 space-y-1">
            {[9, 10].map((fRow) => (
              <div key={fRow} className="grid grid-cols-18 gap-1">
                <div className="col-span-2 flex items-center justify-end pr-2 text-xs font-medium text-slate-400">
                  {fRow === 9 ? '镧系 (57–71)' : '锕系 (89–103)'}
                </div>
                {Array.from({ length: 15 }, (_, idx) => idx + 3).map((col) => {
                  const el = cellMap.get(`${fRow}-${col}`);
                  if (!el) return <div key={`f-empty-${fRow}-${col}`} className="h-14" />;

                  const isSelected = el.number === activeElement.number;
                  const isMatched = matchedSet.has(el.number);
                  const styleSpec = getHeatmapStyle(el, colorMode, simulatedKelvin);

                  return (
                    <button
                      key={el.number}
                      type="button"
                      onClick={() => onSelectElement(el)}
                      onDoubleClick={() => onInspectElement3DAtom(el)}
                      aria-label={`${el.number}号元素 ${el.nameZh} ${el.symbol}`}
                      style={{
                        borderColor: isSelected ? '#22D3EE' : styleSpec.borderColor,
                        backgroundColor: isSelected
                          ? 'rgba(6, 182, 212, 0.28)'
                          : styleSpec.bgColor,
                      }}
                      className={`h-14 rounded-md border p-1 flex flex-col justify-between text-left transition-opacity focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                        isMatched ? 'opacity-100 hover:brightness-125' : 'opacity-20'
                      } ${isSelected ? 'ring-1 ring-cyan-400' : ''}`}
                    >
                      <div className="flex items-center justify-between w-full leading-none">
                        <span className="font-mono tabular-nums text-[10px] text-slate-300">
                          {el.number}
                        </span>
                        <span className="text-[10px] font-medium text-slate-200 truncate">
                          {el.nameZh}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white leading-none">
                        {el.symbol}
                      </div>
                      <div className="font-mono tabular-nums text-[9px] text-slate-300 truncate leading-none">
                        {styleSpec.metricText}
                      </div>
                    </button>
                  );
                })}
                <div className="h-14" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Periodic Trend Line Chart (Z = 1..118) */}
      <PeriodicTrendChart
        activeElement={activeElement}
        onSelectElement={onSelectElement}
      />
    </div>
  );
};
