import React, { useMemo, useState } from 'react';
import { ChemicalElement, ELEMENTS } from '../chemistry/elements';
import { getSafeElementNameZh } from '../utils/glyphSupport';

export type TrendMetricKey =
  | 'ionization'
  | 'electronegativity'
  | 'radius'
  | 'meltingPoint';

interface PeriodicTrendChartProps {
  activeElement: ChemicalElement;
  onSelectElement: (el: ChemicalElement) => void;
}

const METRIC_SPECS: Record<
  TrendMetricKey,
  {
    label: string;
    unit: string;
    strokeColor: string;
    fillColor: string;
    getValue: (el: ChemicalElement) => number | null;
    note: string;
  }
> = {
  ionization: {
    label: '第一电离能',
    unit: 'kJ/mol',
    strokeColor: '#A78BFA',
    fillColor: 'rgba(167, 139, 250, 0.14)',
    getValue: (el) => el.ionizationEnergy,
    note: '每一周期从碱金属波谷（如 Cs、Rb、K）攀升至稀有气体波峰（He、Ne、Ar），清晰展现壳层闭合稳定性。',
  },
  electronegativity: {
    label: '鲍林电负性',
    unit: 'χ',
    strokeColor: '#22D3EE',
    fillColor: 'rgba(34, 211, 238, 0.14)',
    getValue: (el) => el.electronegativity,
    note: '同周期从左向右递增（氟 F 达全表最高 3.98），同主族自上而下递减。',
  },
  radius: {
    label: '共价半径',
    unit: 'pm',
    strokeColor: '#FBBF24',
    fillColor: 'rgba(251, 191, 36, 0.14)',
    getValue: (el) => el.covalentRadius,
    note: '每进入新周期碱金属半径骤增，随后随核电荷数增加与镧系收缩效应逐渐收窄。',
  },
  meltingPoint: {
    label: '熔点温度',
    unit: 'K',
    strokeColor: '#34D399',
    fillColor: 'rgba(52, 211, 153, 0.14)',
    getValue: (el) => el.meltingPoint,
    note: '碳 (C) 与难熔过渡金属钨 (W)、铼 (Re) 位于显著波峰，稀有气体与汞 (Hg) 处于深谷。',
  },
};

const NOBLE_GAS_Z = [2, 10, 18, 36, 54, 86, 118];

export const PeriodicTrendChart: React.FC<PeriodicTrendChartProps> = ({
  activeElement,
  onSelectElement,
}) => {
  const [metric, setMetric] = useState<TrendMetricKey>('ionization');
  const spec = METRIC_SPECS[metric];

  const chartWidth = 960;
  const chartHeight = 206;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 28;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const { segments, points, minVal, maxVal } = useMemo(() => {
    let minV = Infinity;
    let maxV = -Infinity;

    const raw = ELEMENTS.map((el) => {
      const val = spec.getValue(el);
      if (val !== null) {
        if (val < minV) minV = val;
        if (val > maxV) maxV = val;
      }
      return { el, val };
    });

    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
      minV = 0;
      maxV = 100;
    }
    const span = Math.max(1e-3, maxV - minV);

    const pts: {
      el: ChemicalElement;
      val: number;
      x: number;
      y: number;
    }[] = [];

    const segs: string[] = [];
    let currentSeg: string[] = [];

    for (const item of raw) {
      const x = padLeft + ((item.el.number - 1) / 117) * plotW;
      if (item.val === null) {
        if (currentSeg.length > 1) {
          segs.push(currentSeg.join(' '));
        }
        currentSeg = [];
        continue;
      }
      const normY = (item.val - minV) / span;
      const y = padTop + plotH - normY * plotH;
      pts.push({ el: item.el, val: item.val, x, y });
      currentSeg.push(`${currentSeg.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (currentSeg.length > 1) {
      segs.push(currentSeg.join(' '));
    }

    return { segments: segs, points: pts, minVal: minV, maxVal: maxV };
  }, [spec, plotW, plotH]);

  const activePoint = points.find((p) => p.el.number === activeElement.number);
  const safeActiveZh = getSafeElementNameZh(activeElement.number, activeElement.nameZh);

  return (
    <section
      aria-label="元素周期律折线对比图"
      className="rounded-xl bg-[#0E1525] border border-slate-800/90 p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">
            元素周期律随原子序数 (Z = 1–118) 变化折线图
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">{spec.note}</p>
        </div>

        <div
          className="flex items-center gap-1 p-0.5 bg-[#090D16] border border-slate-800 rounded-lg"
          role="group"
          aria-label="周期律趋势图指标切换"
        >
          {(Object.keys(METRIC_SPECS) as TrendMetricKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metric === key
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {METRIC_SPECS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG Plot */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full min-w-[740px] h-auto select-none"
          role="img"
          aria-label={`118元素${spec.label}周期律趋势折线图`}
        >
          {/* Horizontal reference gridlines */}
          {[0, 0.5, 1].map((frac) => {
            const y = padTop + plotH - frac * plotH;
            const labelVal = minVal + frac * (maxVal - minVal);
            return (
              <g key={frac}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={chartWidth - padRight}
                  y2={y}
                  stroke="#1E293B"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[10px]"
                >
                  {metric === 'electronegativity'
                    ? labelVal.toFixed(1)
                    : Math.round(labelVal)}
                </text>
              </g>
            );
          })}

          {/* Period boundary vertical dashed markers at Noble Gases */}
          {NOBLE_GAS_Z.map((z) => {
            const x = padLeft + ((z - 1) / 117) * plotW;
            const ng = ELEMENTS[z - 1];
            return (
              <g key={z}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="#334155"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text
                  x={x}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="fill-slate-400 font-mono text-[10px]"
                >
                  {z} {ng.symbol}
                </text>
              </g>
            );
          })}

          {/* Continuous Periodic Trend Polyline Segments */}
          {segments.map((d, idx) => (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke={spec.strokeColor}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Active Element Crosshair */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={padTop + plotH}
                stroke="#22D3EE"
                strokeWidth={1.2}
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={6.5}
                fill="none"
                stroke="#22D3EE"
                strokeWidth={1.8}
              />
            </g>
          )}

          {/* Clickable Data Nodes for All Measured Elements */}
          {points.map((pt) => {
            const isSelected = pt.el.number === activeElement.number;
            return (
              <circle
                key={pt.el.number}
                cx={pt.x}
                cy={pt.y}
                r={isSelected ? 4.2 : 2.6}
                fill={isSelected ? '#22D3EE' : '#0F172A'}
                stroke={isSelected ? '#FFFFFF' : spec.strokeColor}
                strokeWidth={isSelected ? 1.5 : 1.2}
                className="cursor-pointer hover:r-4"
                onClick={() => onSelectElement(pt.el)}
              >
                <title>
                  {pt.el.number}. {pt.el.nameZh} ({pt.el.symbol}): {pt.val} {spec.unit}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>

      {/* Selected Element Trend Value Readout Footer */}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-300 pt-1 border-t border-slate-800/80 flex-wrap">
        <div>
          <span>当前选中：</span>
          <span className="font-semibold text-white">
            {activeElement.number}. {safeActiveZh.text} ({activeElement.symbol})
          </span>
          <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
          <span>{spec.label}：</span>
          <span className="font-mono tabular-nums font-semibold text-cyan-300">
            {activePoint ? `${activePoint.val} ${spec.unit}` : '暂无实测数据'}
          </span>
        </div>
        <span className="text-slate-400">点击折线图上任意峰值或谷值节点可联动切换元素</span>
      </div>
    </section>
  );
};
