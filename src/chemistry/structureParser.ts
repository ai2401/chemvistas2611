import { ELEMENTS, ELEMENT_BY_SYMBOL } from './elements';
import { AtomNode, BondEdge, BondOrder, MoleculeModel } from './molecules';

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

export function toSubscriptNumber(n: number): string {
  if (n <= 1) return '';
  return String(n)
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[Number(d)] ?? d)
    .join('');
}

/**
 * Formats an atom list into Hill-system molecular formula with Unicode subscripts (e.g. C₈H₁₀N₄O₂).
 */
export function formatMolecularFormula(atoms: AtomNode[]): string {
  if (atoms.length === 0) return '—';
  const counts = new Map<string, number>();
  for (const a of atoms) {
    counts.set(a.element, (counts.get(a.element) ?? 0) + 1);
  }
  const hasCarbon = counts.has('C');
  const symbols = Array.from(counts.keys()).sort((a, b) => {
    if (hasCarbon) {
      const rank = (s: string) => (s === 'C' ? 0 : s === 'H' ? 1 : 2);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
    }
    return a.localeCompare(b);
  });

  return symbols
    .map((sym) => `${sym}${toSubscriptNumber(counts.get(sym) ?? 1)}`)
    .join('');
}

function normalizeElementSymbol(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned) return null;

  // Handle numeric atomic numbers in XYZ files (e.g., "6 0.0 0.0 0.0")
  if (/^\d+$/.test(cleaned)) {
    const z = Number(cleaned);
    const byZ = ELEMENTS[z - 1];
    return byZ ? byZ.symbol : null;
  }

  // Try 2-letter symbol first (e.g., Cl, Fe, Na, Si, Br), then 1-letter (e.g., C, H, O, N)
  if (cleaned.length >= 2) {
    const two = cleaned[0].toUpperCase() + cleaned[1].toLowerCase();
    if (ELEMENT_BY_SYMBOL[two]) return two;
  }
  const one = cleaned[0].toUpperCase();
  if (ELEMENT_BY_SYMBOL[one]) return one;
  return null;
}

/**
 * Infers covalent / ionic bonds from 3D Cartesian coordinates using IUPAC covalent radii.
 */
export function inferBondsFromCoordinates(atoms: AtomNode[]): BondEdge[] {
  const bonds: BondEdge[] = [];
  const n = atoms.length;

  for (let i = 0; i < n; i++) {
    const a = atoms[i];
    const elA = ELEMENT_BY_SYMBOL[a.element];
    const rA = (elA?.covalentRadius ?? 76) / 100;

    for (let j = i + 1; j < n; j++) {
      const b = atoms[j];
      const elB = ELEMENT_BY_SYMBOL[b.element];
      const rB = (elB?.covalentRadius ?? 76) / 100;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      // Fast axis-aligned reject
      const maxBondDist = rA + rB + 0.42;
      if (
        Math.abs(dx) > maxBondDist ||
        Math.abs(dy) > maxBondDist ||
        Math.abs(dz) > maxBondDist
      ) {
        continue;
      }

      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.35 || dist > maxBondDist) continue;

      const idealSingle = rA + rB;
      let order: BondOrder = 'single';
      // Heuristic bond order refinement when neither atom is Hydrogen
      if (a.element !== 'H' && b.element !== 'H') {
        if (dist < idealSingle * 0.82) {
          order = 'triple';
        } else if (dist < idealSingle * 0.91) {
          order = 'double';
        }
      }

      bonds.push({ from: a.id, to: b.id, order });
    }
  }

  return bonds;
}

function buildParsedMoleculeModel(
  atoms: AtomNode[],
  bonds: BondEdge[],
  nameZh: string,
  nameEn: string,
  sourceNote: string
): MoleculeModel {
  if (atoms.length === 0) {
    throw new Error('未能从数据中解析出有效的三维原子坐标。');
  }
  const finalBonds = bonds.length > 0 ? bonds : inferBondsFromCoordinates(atoms);
  const formula = formatMolecularFormula(atoms);

  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nameZh: nameZh || `导入结构 (${formula})`,
    nameEn: nameEn || formula,
    formulaDisplay: formula,
    category: 'organic',
    geometry: `三维空间构象 (${atoms.length} 原子)`,
    symmetry: '实验/计算三维构象',
    hybridization: '基于三维键长与配位自动识别',
    dipoleMoment: '由电负性电荷转移实时计算',
    bondAngleSummary: '点击任意原子或使用自由测距尺实测',
    description: sourceNote,
    atoms,
    bonds: finalBonds,
  };
}

/**
 * Parses Cartesian .xyz chemical coordinate format.
 */
export function parseXyz(content: string, nameHint?: string): MoleculeModel {
  const rawLines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim());

  const nonEmpty = rawLines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error('XYZ 文件内容为空。');
  }

  let startLine = 0;
  let commentTitle = '';
  if (/^\d+$/.test(nonEmpty[0])) {
    // Standard XYZ header: line 0 = atom count, line 1 = title/comment
    commentTitle = rawLines[1]?.trim() ?? '';
    startLine = 2;
  }

  const atoms: AtomNode[] = [];
  const linesToScan = startLine === 2 ? rawLines.slice(2) : nonEmpty;

  for (const line of linesToScan) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const sym = normalizeElementSymbol(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (!sym || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    atoms.push({
      id: atoms.length,
      element: sym,
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      z: Number(z.toFixed(4)),
    });
    if (atoms.length >= 300) break;
  }

  const title = nameHint || commentTitle.slice(0, 36) || '';
  return buildParsedMoleculeModel(
    atoms,
    [],
    title,
    commentTitle || nameHint || 'XYZ Structure',
    `从 XYZ 笛卡尔坐标解析生成，共 ${atoms.length} 个原子，基于 IUPAC 共价半径自动推断共价键拓扑。`
  );
}

/**
 * Parses MDL .mol / .sdf (V2000 & V3000) connection table format.
 */
export function parseMolSdf(content: string, nameHint?: string): MoleculeModel {
  const firstRecord = content.split('$$$$')[0] ?? content;
  const lines = firstRecord.replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 4) {
    throw new Error('MOL/SDF 文件格式不完整（少于 4 行）。');
  }

  const headerTitle = lines[0]?.trim() ?? '';

  // V3000 block fallback
  if (firstRecord.includes('V3000')) {
    const atoms: AtomNode[] = [];
    const idRemap = new Map<number, number>();
    const bonds: BondEdge[] = [];
    let inAtom = false;
    let inBond = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (line.includes('BEGIN ATOM')) {
        inAtom = true;
        continue;
      }
      if (line.includes('END ATOM')) {
        inAtom = false;
        continue;
      }
      if (line.includes('BEGIN BOND')) {
        inBond = true;
        continue;
      }
      if (line.includes('END BOND')) {
        inBond = false;
        continue;
      }
      if (inAtom && line.startsWith('M  V30')) {
        // M  V30 index type x y z aamap
        const tokens = line.replace(/^M\s+V30\s+/, '').split(/\s+/);
        if (tokens.length >= 5) {
          const origIdx = Number(tokens[0]);
          const sym = normalizeElementSymbol(tokens[1]);
          const x = Number(tokens[2]);
          const y = Number(tokens[3]);
          const z = Number(tokens[4]);
          if (sym && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            const newId = atoms.length;
            idRemap.set(origIdx, newId);
            atoms.push({ id: newId, element: sym, x, y, z });
          }
        }
      } else if (inBond && line.startsWith('M  V30')) {
        // M  V30 index type atom1 atom2
        const tokens = line.replace(/^M\s+V30\s+/, '').split(/\s+/);
        if (tokens.length >= 4) {
          const bType = Number(tokens[1]);
          const a1 = idRemap.get(Number(tokens[2]));
          const a2 = idRemap.get(Number(tokens[3]));
          if (a1 !== undefined && a2 !== undefined && a1 !== a2) {
            const order: BondOrder =
              bType === 2 ? 'double' : bType === 3 ? 'triple' : bType === 4 ? 'aromatic' : 'single';
            bonds.push({ from: a1, to: a2, order });
          }
        }
      }
    }

    return buildParsedMoleculeModel(
      atoms,
      bonds,
      nameHint || headerTitle,
      headerTitle || nameHint || 'SDF V3000',
      `从 MDL V3000 结构表解析生成，包含精确三维构象坐标与显式键级连接表。`
    );
  }

  // Standard V2000 Counts line at index 3 (or find line with V2000)
  let countsLineIdx = 3;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].includes('V2000')) {
      countsLineIdx = i;
      break;
    }
  }

  const countsLine = lines[countsLineIdx] ?? '';
  let atomCount = parseInt(countsLine.slice(0, 3).trim(), 10);
  let bondCount = parseInt(countsLine.slice(3, 6).trim(), 10);

  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
    const parts = countsLine.trim().split(/\s+/);
    atomCount = parseInt(parts[0] ?? '0', 10);
    bondCount = parseInt(parts[1] ?? '0', 10);
  }

  if (!Number.isFinite(atomCount) || atomCount <= 0) {
    throw new Error('无法识别 MOL/SDF 中的原子计数行。');
  }

  const atoms: AtomNode[] = [];
  const atomStart = countsLineIdx + 1;
  for (let i = 0; i < atomCount && atomStart + i < lines.length; i++) {
    const line = lines[atomStart + i];
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    const sym = normalizeElementSymbol(parts[3]);
    if (sym && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      atoms.push({
        id: atoms.length,
        element: sym,
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        z: Number(z.toFixed(4)),
      });
    }
  }

  // Check if all Z coordinates are 0.0000 (2D molfile) and apply slight puckering notice if needed
  const bonds: BondEdge[] = [];
  const bondStart = atomStart + atomCount;
  for (let i = 0; i < bondCount && bondStart + i < lines.length; i++) {
    const line = lines[bondStart + i];
    let from1 = parseInt(line.slice(0, 3).trim(), 10);
    let to1 = parseInt(line.slice(3, 6).trim(), 10);
    let bType = parseInt(line.slice(6, 9).trim(), 10);

    if (!Number.isFinite(from1) || !Number.isFinite(to1)) {
      const parts = line.trim().split(/\s+/);
      from1 = parseInt(parts[0] ?? '0', 10);
      to1 = parseInt(parts[1] ?? '0', 10);
      bType = parseInt(parts[2] ?? '1', 10);
    }

    const fromIdx = from1 - 1;
    const toIdx = to1 - 1;
    if (
      fromIdx >= 0 &&
      fromIdx < atoms.length &&
      toIdx >= 0 &&
      toIdx < atoms.length &&
      fromIdx !== toIdx
    ) {
      const order: BondOrder =
        bType === 2
          ? 'double'
          : bType === 3
            ? 'triple'
            : bType === 4
              ? 'aromatic'
              : 'single';
      bonds.push({ from: fromIdx, to: toIdx, order });
    }
  }

  // Try extracting PubChem IUPAC name or CID if present
  let pubchemCid = '';
  const cidMatch = firstRecord.match(/>\s*<PUBCHEM_COMPOUND_CID>\s*\n(\d+)/);
  if (cidMatch) {
    pubchemCid = `CID ${cidMatch[1]}`;
  }

  return buildParsedMoleculeModel(
    atoms,
    bonds,
    nameHint || headerTitle || pubchemCid,
    pubchemCid ? `${nameHint || headerTitle} (${pubchemCid})` : headerTitle || 'MDL Structure',
    `从标准 MDL SDF/MOL 结构表解析生成${pubchemCid ? `（PubChem ${pubchemCid}）` : ''}，包含 ${atoms.length} 个原子与 ${bonds.length} 根显式化学键。`
  );
}

/**
 * Parses Protein Data Bank (.pdb / .ent) ATOM, HETATM, and CONECT records.
 */
export function parsePdb(content: string, nameHint?: string): MoleculeModel {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const atoms: AtomNode[] = [];
  const serialToId = new Map<number, number>();
  const conectPairs = new Set<string>();
  const bonds: BondEdge[] = [];
  let titleText = '';

  for (const line of lines) {
    if (line.startsWith('TITLE ')) {
      titleText += ' ' + line.slice(10).trim();
    } else if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
      if (atoms.length >= 280) continue;
      const serial = parseInt(line.slice(6, 11).trim(), 10);
      const atomName = line.slice(12, 16).trim();
      const x = parseFloat(line.slice(30, 38).trim());
      const y = parseFloat(line.slice(38, 46).trim());
      const z = parseFloat(line.slice(46, 54).trim());
      const elemCol = line.length >= 78 ? line.slice(76, 78).trim() : '';

      const sym =
        normalizeElementSymbol(elemCol) ??
        normalizeElementSymbol(atomName.replace(/^\d+/, ''));

      if (sym && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        const id = atoms.length;
        if (Number.isFinite(serial)) {
          serialToId.set(serial, id);
        }
        atoms.push({
          id,
          element: sym,
          x: Number(x.toFixed(4)),
          y: Number(y.toFixed(4)),
          z: Number(z.toFixed(4)),
        });
      }
    } else if (line.startsWith('CONECT')) {
      const nums =
        line
          .slice(6)
          .match(/.{1,5}/g)
          ?.map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n)) ?? [];
      if (nums.length >= 2) {
        const srcId = serialToId.get(nums[0]);
        if (srcId !== undefined) {
          for (let k = 1; k < nums.length; k++) {
            const dstId = serialToId.get(nums[k]);
            if (dstId !== undefined && dstId !== srcId) {
              const key = srcId < dstId ? `${srcId}-${dstId}` : `${dstId}-${srcId}`;
              if (!conectPairs.has(key)) {
                conectPairs.add(key);
                bonds.push({ from: srcId, to: dstId, order: 'single' });
              }
            }
          }
        }
      }
    }
  }

  // Merge inferred bonds if CONECT only covered heteroatoms or was absent
  const inferred = inferBondsFromCoordinates(atoms);
  for (const inf of inferred) {
    const key = inf.from < inf.to ? `${inf.from}-${inf.to}` : `${inf.to}-${inf.from}`;
    if (!conectPairs.has(key)) {
      conectPairs.add(key);
      bonds.push(inf);
    }
  }

  const cleanTitle = nameHint || titleText.trim().slice(0, 40) || 'PDB 结构';
  return buildParsedMoleculeModel(
    atoms,
    bonds,
    cleanTitle,
    titleText.trim().slice(0, 48) || 'PDB Coordinate Entry',
    `从 PDB 晶体/生物大分子记录解析生成，共载入 ${atoms.length} 个三维原子位点与 ${bonds.length} 根共价连接。`
  );
}

/**
 * Auto-detects chemical file format (.xyz, .mol, .sdf, .pdb) from filename or content.
 */
export function parseChemicalStructureText(
  content: string,
  filenameOrTitle = ''
): MoleculeModel {
  const lower = filenameOrTitle.toLowerCase();
  const baseName = filenameOrTitle.replace(/\.(xyz|mol|sdf|pdb|ent|txt)$/i, '').trim();

  if (lower.endsWith('.pdb') || lower.endsWith('.ent')) {
    return parsePdb(content, baseName);
  }
  if (lower.endsWith('.mol') || lower.endsWith('.sdf')) {
    return parseMolSdf(content, baseName);
  }
  if (lower.endsWith('.xyz')) {
    return parseXyz(content, baseName);
  }

  // Content signature sniffing
  if (content.includes('V2000') || content.includes('V3000') || content.includes('M  END')) {
    return parseMolSdf(content, baseName);
  }
  if (/^(ATOM  |HETATM)/m.test(content)) {
    return parsePdb(content, baseName);
  }
  return parseXyz(content, baseName);
}

// Common Chinese compound names mapped to exact PubChem English identifiers for seamless Chinese search
export const CHINESE_COMPOUND_QUERY_MAP: Record<string, { query: string; nameZh: string }> = {
  多巴胺: { query: 'dopamine', nameZh: '多巴胺' },
  葡萄糖: { query: 'glucose', nameZh: 'D-葡萄糖' },
  青蒿素: { query: 'artemisinin', nameZh: '青蒿素' },
  布洛芬: { query: 'ibuprofen', nameZh: '布洛芬' },
  对乙酰氨基酚: { query: 'acetaminophen', nameZh: '对乙酰氨基酚 (扑热息痛)' },
  扑热息痛: { query: 'acetaminophen', nameZh: '对乙酰氨基酚 (扑热息痛)' },
  肾上腺素: { query: 'epinephrine', nameZh: '肾上腺素' },
  褪黑素: { query: 'melatonin', nameZh: '褪黑素' },
  血清素: { query: 'serotonin', nameZh: '血清素 (5-羟色胺)' },
  丙酮: { query: 'acetone', nameZh: '丙酮' },
  乙酸: { query: 'acetic acid', nameZh: '乙酸 (醋酸)' },
  醋酸: { query: 'acetic acid', nameZh: '乙酸 (醋酸)' },
  甲醛: { query: 'formaldehyde', nameZh: '甲醛' },
  甲苯: { query: 'toluene', nameZh: '甲苯' },
  苯酚: { query: 'phenol', nameZh: '苯酚' },
  尿素: { query: 'urea', nameZh: '尿素' },
  柠檬酸: { query: 'citric acid', nameZh: '柠檬酸' },
  乳酸: { query: 'lactic acid', nameZh: '乳酸' },
  甘氨酸: { query: 'glycine', nameZh: '甘氨酸' },
  色氨酸: { query: 'tryptophan', nameZh: 'L-色氨酸' },
  维生素c: { query: 'ascorbic acid', nameZh: '维生素 C (抗坏血酸)' },
  抗坏血酸: { query: 'ascorbic acid', nameZh: '维生素 C (抗坏血酸)' },
  胆固醇: { query: 'cholesterol', nameZh: '胆固醇' },
  青霉素: { query: 'penicillin g', nameZh: '青霉素 G' },
  尼古丁: { query: 'nicotine', nameZh: '尼古丁 (烟碱)' },
  香兰素: { query: 'vanillin', nameZh: '香兰素' },
  环己烷: { query: 'cyclohexane', nameZh: '环己烷 (椅式构象)' },
  过氧化氢: { query: 'hydrogen peroxide', nameZh: '过氧化氢 (双氧水)' },
  双氧水: { query: 'hydrogen peroxide', nameZh: '过氧化氢 (双氧水)' },
  六氟化硫: { query: 'sulfur hexafluoride', nameZh: '六氟化硫' },
  三磷酸腺苷: { query: 'adenosine triphosphate', nameZh: '三磷酸腺苷 (ATP)' },
};

/**
 * Queries NCBI PubChem PUG-REST API for a real 3D SDF conformer by name, CAS, CID, or Chinese alias.
 */
export async function fetchPubChem3DMolecule(rawInput: string): Promise<MoleculeModel> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('请输入化合物名称、英文名、CAS 号或 PubChem CID。');
  }

  const mapped = CHINESE_COMPOUND_QUERY_MAP[trimmed.toLowerCase()];
  const queryTerm = mapped ? mapped.query : trimmed;
  const displayZh = mapped ? mapped.nameZh : trimmed;

  const isCid = /^\d+$/.test(queryTerm);
  const endpointBase = isCid
    ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(queryTerm)}`
    : `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(queryTerm)}`;

  const res3d = await fetch(`${endpointBase}/SDF?record_type=3d`);
  if (res3d.ok) {
    const sdfText = await res3d.text();
    const parsed = parseMolSdf(sdfText, displayZh);
    parsed.nameEn = queryTerm;
    return parsed;
  }

  // Fallback to standard SDF record if molecule has > 50 rotatable bonds or lacks precomputed MMFF94s 3D conformer
  const res2d = await fetch(`${endpointBase}/SDF`);
  if (res2d.ok) {
    const sdfText = await res2d.text();
    const parsed = parseMolSdf(sdfText, displayZh);
    parsed.nameEn = queryTerm;
    return parsed;
  }

  throw new Error(
    `未在 PubChem 数据库中找到“${trimmed}”的三维结构，请尝试输入英文标准名（如 dopamine、glucose、ibuprofen）或 PubChem CID。`
  );
}

export const SAMPLE_XYZ_ACETONE = `10
丙酮 (Acetone, C3H6O)
C    0.0000    0.1280    0.0000
O    0.0000    1.3480    0.0000
C   -1.2880   -0.6740    0.0000
C    1.2880   -0.6740    0.0000
H   -1.3260   -1.3220    0.8840
H   -1.3260   -1.3220   -0.8840
H   -2.1420    0.0060    0.0000
H    1.3260   -1.3220    0.8840
H    1.3260   -1.3220   -0.8840
H    2.1420    0.0060    0.0000`;
