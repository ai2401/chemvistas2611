// Detects whether the current OS/browser font stack supports rare CJK Extension B/E/F
// IUPAC superheavy element characters (Z=104..118), providing a clean radical-ligature fallback
// on Linux systems that lack CJK Ext-E fonts so tofu boxes (▯) never appear.

const SUPERHEAVY_COMPONENTS: Record<number, [string, string]> = {
  104: ['钅', '卢'], // 𬬻 Rf
  105: ['钅', '杜'], // 𬭊 Db
  106: ['钅', '喜'], // 𬭳 Sg
  107: ['钅', '波'], // 𬭛 Bh
  108: ['钅', '黑'], // 𬭶 Hs
  109: ['钅', '迈'], // 𬏝 Mt
  110: ['钅', '达'], // 𫟼 Ds
  111: ['钅', '仑'], // 𬬭 Rg
  114: ['钅', '夫'], // 𫓧 Fl
  116: ['钅', '立'], // 𫟷 Lv
  117: ['石', '田'], // 鿬 Ts
  118: ['气', '奥'], // 鿫 Og
};

const supportCache = new Map<string, boolean>();
let sharedCtx: CanvasRenderingContext2D | null = null;
let cachedTofuSig: string | null = null;

function getProbeContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (sharedCtx) return sharedCtx;
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  sharedCtx = canvas.getContext('2d', { willReadFrequently: true });
  return sharedCtx;
}

function renderGlyphSig(ctx: CanvasRenderingContext2D, str: string): string {
  ctx.clearRect(0, 0, 24, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(str, 2, 18);
  const data = ctx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  let weighted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 32) {
      sum++;
      weighted += i * data[i];
    }
  }
  return `${sum}:${weighted}`;
}

export function isGlyphSupported(char: string): boolean {
  if (typeof document === 'undefined') return true;
  const cached = supportCache.get(char);
  if (cached !== undefined) return cached;

  try {
    const ctx = getProbeContext();
    if (!ctx) return true;

    if (cachedTofuSig === null) {
      cachedTofuSig = renderGlyphSig(ctx, '\uFFFF');
    }
    const charSig = renderGlyphSig(ctx, char);
    const supported = charSig !== cachedTofuSig && !charSig.startsWith('0:');
    supportCache.set(char, supported);
    return supported;
  } catch {
    return true;
  }
}

export function getSafeElementNameZh(atomicNumber: number, nameZh: string): {
  supported: boolean;
  parts?: [string, string];
  text: string;
} {
  const pair = SUPERHEAVY_COMPONENTS[atomicNumber];
  if (!pair) return { supported: true, text: nameZh };
  if (isGlyphSupported(nameZh)) {
    return { supported: true, text: nameZh };
  }
  return {
    supported: false,
    parts: pair,
    text: `${pair[0]}${pair[1]}`,
  };
}
