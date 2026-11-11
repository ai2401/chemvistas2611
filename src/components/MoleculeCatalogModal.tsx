import React, { useState } from 'react';
import { Search, ArrowUpRight, Upload } from 'lucide-react';
import {
  MOLECULE_CATEGORY_LABELS,
  MoleculeCategory,
  MoleculeModel,
} from '../chemistry/molecules';
import { analyzeMoleculeComposition } from '../chemistry/calculations';

interface MoleculeCatalogViewProps {
  molecules: MoleculeModel[];
  selectedMoleculeId: string;
  onSelectMoleculeAndOpen3D: (mol: MoleculeModel) => void;
  onOpenImportModal: () => void;
}

export const MoleculeCatalogView: React.FC<MoleculeCatalogViewProps> = ({
  molecules,
  selectedMoleculeId,
  onSelectMoleculeAndOpen3D,
  onOpenImportModal,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MoleculeCategory | 'all'>('all');

  const filtered = molecules.filter((mol) => {
    if (category !== 'all' && mol.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      mol.nameZh.toLowerCase().includes(q) ||
      mol.nameEn.toLowerCase().includes(q) ||
      mol.formulaDisplay.toLowerCase().includes(q) ||
      mol.geometry.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#090D16] p-5 lg:p-8 space-y-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              三维化学分子与晶胞结构图鉴
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              涵盖无机小分子、基础有机烃醇、医药活性分子及晶胞，支持本地 .xyz/.mol/.sdf/.pdb 导入与 PubChem 在线检索。
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入结构 / PubChem 检索</span>
            </button>

            <div className="relative">
              <label htmlFor="molecule-catalog-search" className="sr-only">
                搜索分子或晶胞名称
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="molecule-catalog-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索分子名、化学式或构型..."
                className="w-60 pl-9 pr-3 py-1.5 text-xs bg-[#111929] border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div
          className="flex items-center gap-1 p-1 bg-[#111929] border border-slate-800 rounded-lg w-fit flex-wrap"
          role="group"
          aria-label="图鉴类别筛选"
        >
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              category === 'all'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            全部结构 ({molecules.length})
          </button>
          {(Object.keys(MOLECULE_CATEGORY_LABELS) as MoleculeCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                category === cat
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {MOLECULE_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Molecule Cards Grid — Single-elevation, zero badge sandwiches */}
        {filtered.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111929] border border-slate-800 text-center space-y-3">
            <p className="text-sm text-slate-300">
              本地图鉴中暂无匹配“{query}”的结构，您可直接从 PubChem 在线三维分子库拉取该化合物。
            </p>
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>前往 PubChem 检索或导入文件</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((mol) => {
              const { molarMass, composition } = analyzeMoleculeComposition(mol);
              const isCurrent = mol.id === selectedMoleculeId;

              return (
                <article
                  key={mol.id}
                  className={`rounded-xl bg-[#101827] border p-5 flex flex-col justify-between gap-4 transition-colors ${
                    isCurrent
                      ? 'border-cyan-400/70'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        {mol.nameZh}
                      </h2>
                      <span className="font-mono text-sm font-semibold text-cyan-300">
                        {mol.formulaDisplay}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center flex-wrap gap-1.5">
                      <span>{MOLECULE_CATEGORY_LABELS[mol.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{molarMass} g/mol</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {mol.atoms.length} 原子 / {mol.bonds.length} 键
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-300 line-clamp-3">
                      {mol.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                      {composition.map((c, idx) => (
                        <React.Fragment key={c.element.symbol}>
                          {idx > 0 && <span aria-hidden="true">·</span>}
                          <span className="font-mono text-slate-300">
                            {c.element.symbol}({c.count})
                          </span>
                        </React.Fragment>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectMoleculeAndOpen3D(mol)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>三维观察</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
