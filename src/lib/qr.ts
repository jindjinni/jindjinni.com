// A small QR code maker (byte mode, error-correction level M, versions 1-10 = up to 213 characters), so the two-step sign-in
// setup can show a scannable picture without adding a package. Output is a grid of true/false squares; qrSvg() draws it.

const EC_M: Record<number, { ec: number; g1: [number, number]; g2: [number, number] }> = {
  1: { ec: 10, g1: [1, 16], g2: [0, 0] },
  2: { ec: 16, g1: [1, 28], g2: [0, 0] },
  3: { ec: 26, g1: [1, 44], g2: [0, 0] },
  4: { ec: 18, g1: [2, 32], g2: [0, 0] },
  5: { ec: 24, g1: [2, 43], g2: [0, 0] },
  6: { ec: 16, g1: [4, 27], g2: [0, 0] },
  7: { ec: 18, g1: [4, 31], g2: [0, 0] },
  8: { ec: 22, g1: [2, 38], g2: [2, 39] },
  9: { ec: 22, g1: [3, 36], g2: [2, 37] },
  10: { ec: 26, g1: [4, 43], g2: [1, 44] },
};
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const dataCodewords = (v: number) => EC_M[v].g1[0] * EC_M[v].g1[1] + EC_M[v].g2[0] * EC_M[v].g2[1];

// GF(256), x^8 + x^4 + x^3 + x^2 + 1
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gmul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], n: number): number[] {
  const gen = rsGenerator(n);
  const rem = new Array<number>(n).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= gmul(gen[i + 1], factor);
  }
  return rem;
}

function bchFormat(data: number): number {
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function bchVersion(v: number): number {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | rem;
}

function buildCodewords(bytes: number[], version: number): number[] {
  const cap = dataCodewords(version);
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);

  const { ec, g1, g2 } = EC_M[version];
  const blocks: number[][] = [];
  let pos = 0;
  for (const [count, size] of [g1, g2]) {
    for (let i = 0; i < count; i++) {
      blocks.push(data.slice(pos, pos + size));
      pos += size;
    }
  }
  const eccs = blocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of eccs) out.push(e[i]);
  return out;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const runScore = (line: boolean[]) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) s += run - 2;
        run = 1;
      }
    }
    if (run >= 5) s += run - 2;
    return s;
  };
  for (let i = 0; i < n; i++) {
    score += runScore(m[i]);
    score += runScore(m.map((row) => row[i]));
  }
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  const rev = [...pat].reverse();
  const match = (get: (k: number) => boolean, p: boolean[]) => p.every((v, k) => get(k) === v);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= n - 11; j++) {
      if (match((k) => m[i][j + k], pat) || match((k) => m[i][j + k], rev)) score += 40;
      if (match((k) => m[j + k][i], pat) || match((k) => m[j + k][i], rev)) score += 40;
    }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

/** The QR grid (true = dark square) for this text, or null when it is too long for versions 1-10. */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = Array.from(Buffer.from(text, "utf8"));
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const need = 4 + (v >= 10 ? 16 : 8) + bytes.length * 8;
    if (need <= dataCodewords(v) * 8) {
      version = v;
      break;
    }
  }
  if (!version) return null;
  const n = version * 4 + 17;
  const codewords = buildCodewords(bytes, version);

  const modules: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const reserved: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const set = (r: number, c: number, dark: boolean) => {
    modules[r][c] = dark;
    reserved[r][c] = true;
  };

  const finder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= n || c >= n) continue;
        const edge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        set(r, c, dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (edge || core));
      }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const al = ALIGN[version];
  for (const r of al)
    for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  // Reserve the format areas and the single always-dark square
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = true;
    reserved[n - 1 - i][8] = true;
  }
  set(n - 8, 8, true);
  if (version >= 7) {
    const info = bchVersion(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + n - 11;
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  // Place the data bits in the zigzag order
  const bits: boolean[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push(((cw >>> i) & 1) === 1);
  const remainder = version >= 2 && version <= 6 ? 7 : 0;
  for (let i = 0; i < remainder; i++) bits.push(false);
  let idx = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const up = ((right + 1) & 2) === 0;
        const r = up ? n - 1 - vert : vert;
        if (!reserved[r][c] && idx < bits.length) modules[r][c] = bits[idx++];
      }
    }
  }

  const withMask = (mask: number): boolean[][] => {
    const m = modules.map((row) => row.slice());
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!reserved[r][c] && MASKS[mask](r, c)) m[r][c] = !m[r][c];
    const fmt = bchFormat((0b00 << 3) | mask); // level M = 00
    const bit = (i: number) => ((fmt >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6);
    m[8][8] = bit(7);
    m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[n - 15 + i][8] = bit(i);
    m[n - 8][8] = true;
    return m;
  };
  let best = withMask(0);
  let bestScore = penalty(best);
  for (let k = 1; k < 8; k++) {
    const m = withMask(k);
    const s = penalty(m);
    if (s < bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return best;
}

/** An SVG picture (with the 4-square quiet border) -- dark on white so every scanner can read it, in either theme. */
export function qrSvg(text: string, px = 200): string | null {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length;
  const q = 4;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) path += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + q * 2} ${n + q * 2}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="Scan this with your authenticator app"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}
