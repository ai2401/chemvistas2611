import React, { useRef, useState } from 'react';
import { Globe, Upload, X, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { MoleculeModel } from '../chemistry/molecules';
import {
  fetchPubChem3DMolecule,
  parseChemicalStructureText,
  SAMPLE_XYZ_ACETONE,
} from '../chemistry/structureParser';

interface ImportPubChemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportMolecule: (mol: MoleculeModel) => void;
}

type ModalTab = 'pubchem' | 'file';

const PUBCHEM_QUICK_PICKS = [
  '多巴胺',
  '青蒿素',
  '葡萄糖',
  '布洛芬',
  '褪黑素',
  '维生素C',
  '环己烷',
  '香兰素',
];

export const ImportPubChemModal: React.FC<ImportPubChemModalProps> = ({
  isOpen,
  onClose,
  onImportMolecule,
}) => {
  const [tab, setTab] = useState<ModalTab>('pubchem');
  const [pubchemQuery, setPubchemQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rawText, setRawText] = useState('');
  const [customName, setCustomName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handlePubChemSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? pubchemQuery).trim();
    if (!q) {
      setErrorMsg('请输入化合物中文名、英文名、CAS 号或 PubChem CID。');
      return;
    }
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const mol = await fetchPubChem3DMolecule(q);
      onImportMolecule(mol);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '连接 PubChem 在线数据库失败，请检查网络或尝试本地文件导入。'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleParseText = () => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setErrorMsg('请先上传结构文件或在文本框中粘贴 .xyz / .mol / .sdf / .pdb 坐标内容。');
      return;
    }
    setErrorMsg(null);
    try {
      const mol = parseChemicalStructureText(trimmed, customName.trim());
      onImportMolecule(mol);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : '结构坐标解析失败，请检查文件格式。'
      );
    }
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    try {
      const text = await file.text();
      setRawText(text);
      if (!customName.trim()) {
        setCustomName(file.name.replace(/\.(xyz|mol|sdf|pdb|ent|txt)$/i, ''));
      }
      const mol = parseChemicalStructureText(text, file.name);
      onImportMolecule(mol);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : '读取或解析本地化学文件失败。'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-pubchem-modal-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-[#0D1424] border border-slate-700/90 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0B101B]">
          <div>
            <h2
              id="import-pubchem-modal-title"
              className="text-base font-bold text-white tracking-tight"
            >
              导入外部化学结构与 PubChem 在线检索
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              支持 NCBI PubChem 实时三维构象拉取及本地 .xyz / .mol / .sdf / .pdb 格式解析
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导入窗口"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 pt-4">
          <div
            className="grid grid-cols-2 gap-1 p-1 bg-[#111929] rounded-lg border border-slate-800"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'pubchem'}
              onClick={() => {
                setTab('pubchem');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'pubchem'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>PubChem 在线三维库</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'file'}
              onClick={() => {
                setTab('file');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'file'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>本地文件 / 坐标粘贴</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/50 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {tab === 'pubchem' ? (
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handlePubChemSearch();
                }}
                className="space-y-2"
              >
                <label
                  htmlFor="pubchem-compound-input"
                  className="block text-xs font-medium text-slate-300"
                >
                  化合物名称（支持常用中文名、英文 IUPAC 名、CAS 号或 PubChem CID）
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="pubchem-compound-input"
                    type="text"
                    value={pubchemQuery}
                    onChange={(e) => setPubchemQuery(e.target.value)}
                    placeholder="例如：多巴胺、青蒿素、glucose、ibuprofen、2244..."
                    className="flex-1 px-3.5 py-2 text-xs bg-[#111929] border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>拉取三维构象...</span>
                      </>
                    ) : (
                      <span>检索并载入 3D</span>
                    )}
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <div className="text-xs text-slate-400">热门生物医药与有机分子一键检索：</div>
                <div className="flex flex-wrap gap-1.5">
                  {PUBCHEM_QUICK_PICKS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        setPubchemQuery(name);
                        void handlePubChemSearch(name);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#131C2E] hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-xs text-slate-200 transition-colors whitespace-nowrap"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#111929] border border-slate-800/80 text-xs text-slate-400 leading-relaxed">
                数据直接取自美国国家生物技术信息中心（NCBI PubChem PUG-REST）预计算的 MMFF94s 能量最低三维构象 SDF 连接表，载入后自动支持键角测量、静电势 ESP 着色与键长解构。
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* File Drop / Picker */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xyz,.mol,.sdf,.pdb,.ent,.txt"
                  onChange={(e) => void handleFileUpload(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>选择本地文件 (.xyz / .mol / .sdf / .pdb)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCustomName('丙酮 (Acetone)');
                    setRawText(SAMPLE_XYZ_ACETONE);
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#131C2E] border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>填入丙酮 .xyz 示例数据</span>
                </button>
              </div>

              <div>
                <label
                  htmlFor="custom-structure-name"
                  className="block text-xs text-slate-400 mb-1"
                >
                  结构显示名称（可选）
                </label>
                <input
                  id="custom-structure-name"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="留空将自动读取文件标题行或生成分子式..."
                  className="w-full px-3 py-1.5 text-xs bg-[#111929] border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label
                  htmlFor="chemical-structure-textarea"
                  className="block text-xs text-slate-400 mb-1"
                >
                  三维坐标文本内容（自动识别 XYZ、MDL V2000/V3000 MOL/SDF、PDB HETATM/ATOM）
                </label>
                <textarea
                  id="chemical-structure-textarea"
                  rows={7}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`10\nAcetone\nC  0.0000  0.1280  0.0000\nO  0.0000  1.3480  0.0000\n...`}
                  className="w-full p-3 font-mono text-xs bg-[#090D16] border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#131C2E] border border-slate-800 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleParseText}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>解析并载入三维视窗</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
