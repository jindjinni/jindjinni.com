"use client";

// Reads lot and serial numbers out of a clear group photo, entirely inside the browser (nothing is uploaded):
//  1. barcodes and QR / DataMatrix codes, found with the browser's own detector when it has one and with ZXing otherwise;
//  2. printed text, read with Tesseract OCR whose files are served by this app (public/ocr).
// The picture is cut into overlapping tiles so small print on a 4K photo is read at full sharpness. Whatever is found
// is only a CANDIDATE: the receiver confirms every number before it is saved (see numbers-tab.tsx).

export type ReadProgress = { step: string; pct: number };

export type PhotoReading = {
  barcodes: string[];
  text: string;
  width: number;
  height: number;
  tiles: number;
  /** Plain-language problems with the picture itself (too small, too blurry). */
  warnings: string[];
};

/** Longest side we work at. Bigger photos are scaled down to this to keep phones from running out of memory. */
const MAX_SIDE = 5000;
/** A group photo needs at least this many pixels on its long side for small print to be readable. */
export const MIN_GOOD_SIDE = 3000;
const TILE = 1500;
const OVERLAP = 420;

type Tesseract = typeof import("tesseract.js");
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker(onProgress: (p: ReadProgress) => void) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const T: Tesseract = await import("tesseract.js");
      onProgress({ step: "Starting the photo reader (first time only)…", pct: 0 });
      const w = await T.createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        gzip: true,
      });
      await w.setParameters({
        tessedit_pageseg_mode: T.PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/:()#. ",
        user_defined_dpi: "300",
      });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Grey, with the dark-to-light range stretched so faded print stands out. */
function prepareForText(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g | 0]++;
  }
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255; lo++) {
    acc += hist[lo];
    if (acc > total * 0.01) break;
  }
  for (let acc = 0; hi > 0; hi--) {
    acc += hist[hi];
    if (acc > total * 0.01) break;
  }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/** How sharp the picture is: the spread of edge strength on a small copy. Under about 18 the print is usually unreadable. */
function sharpness(src: HTMLCanvasElement): number {
  const s = 700 / Math.max(src.width, src.height);
  const c = makeCanvas(src.width * Math.min(1, s), src.height * Math.min(1, s));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 99;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  const g = new Float32Array(width * height);
  for (let i = 0; i < g.length; i++) g[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - width] - g[i + width];
      sum += lap;
      sum2 += lap * lap;
      n++;
    }
  }
  const mean = sum / Math.max(1, n);
  return Math.sqrt(Math.max(0, sum2 / Math.max(1, n) - mean * mean));
}

type Detector = { detect: (img: CanvasImageSource) => Promise<{ rawValue: string }[]> };

async function nativeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o?: unknown): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = (await BD.getSupportedFormats?.()) ?? [];
    const want = ["data_matrix", "qr_code", "code_128", "code_39", "ean_13", "upc_a", "itf", "pdf417", "aztec"].filter((f) => formats.includes(f));
    return new BD(want.length ? { formats: want } : undefined);
  } catch {
    return null;
  }
}

/** Finds every barcode in a canvas by reading one, blanking it out, and reading again. */
async function zxingAll(canvas: HTMLCanvasElement, found: Set<string>) {
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.UPC_A,
    BarcodeFormat.ITF,
    BarcodeFormat.PDF_417,
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 12; i++) {
    let res;
    try {
      res = reader.decodeFromCanvas(canvas);
    } catch {
      return; // nothing (more) in this picture
    }
    const text = res.getText();
    if (text) found.add(text);
    const pts = res.getResultPoints();
    if (!ctx || !pts || pts.length === 0) return;
    const xs = pts.map((p) => p.getX());
    const ys = pts.map((p) => p.getY());
    const padX = Math.max(20, (Math.max(...xs) - Math.min(...xs)) * 0.35);
    const padY = Math.max(20, (Math.max(...ys) - Math.min(...ys)) * 0.35);
    ctx.fillStyle = "#808080";
    ctx.fillRect(Math.min(...xs) - padX, Math.min(...ys) - padY, Math.max(...xs) - Math.min(...xs) + 2 * padX, Math.max(...ys) - Math.min(...ys) + 2 * padY);
    await new Promise((r) => setTimeout(r, 0));
  }
}


type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
type OcrLine = { text: string; words?: OcrWord[] };

/**
 * The text of one tile, leaving out any word that touches an edge where the picture was cut. Such a word is only part of
 * the real number; the neighbouring tile (the tiles overlap) has it whole. Words at the true edge of the photo are kept.
 */
function textInsideTile(
  data: { text: string; lines?: OcrLine[] },
  t: { w: number; h: number; cutLeft: boolean; cutRight: boolean; cutTop: boolean; cutBottom: boolean },
): string {
  if (!data.lines || data.lines.length === 0) return data.text;
  const m = 8;
  const out: string[] = [];
  for (const line of data.lines) {
    if (!line.words || line.words.length === 0) {
      out.push(line.text);
      continue;
    }
    const kept = line.words.filter(
      (w) => !((t.cutLeft && w.bbox.x0 < m) || (t.cutRight && w.bbox.x1 > t.w - m) || (t.cutTop && w.bbox.y0 < m) || (t.cutBottom && w.bbox.y1 > t.h - m)),
    );
    if (kept.length) out.push(kept.map((w) => w.text).join(" "));
  }
  return out.join("\n");
}

export async function readGroupPhoto(file: File, onProgress: (p: ReadProgress) => void, signal?: AbortSignal): Promise<PhotoReading> {
  const bmp = await createImageBitmap(file);
  const bw = bmp.width;
  const bh = bmp.height;
  const warnings: string[] = [];
  const origLong = Math.max(bw, bh);
  if (origLong < MIN_GOOD_SIDE) {
    warnings.push(`This photo is only ${bw} × ${bh}. For a group photo use the camera's 4K setting (3840 × 2160 or higher) so small print is readable, and expect to fix more numbers by hand.`);
  }
  const scale = Math.min(1, MAX_SIDE / origLong);
  const full = makeCanvas(bw * scale, bh * scale);
  full.getContext("2d")?.drawImage(bmp, 0, 0, full.width, full.height);
  bmp.close?.();
  const sharp = sharpness(full);
  if (sharp < 14) warnings.push("The photo looks blurry. Hold the camera steady, let it focus, and retake it. Blurry print is where numbers get misread.");

  const barcodes = new Set<string>();
  const native = await nativeDetector();

  // Tiles
  const step = TILE - OVERLAP;
  const cols = Math.max(1, Math.ceil((full.width - OVERLAP) / step));
  const rows = Math.max(1, Math.ceil((full.height - OVERLAP) / step));
  const tw = Math.ceil(full.width / cols) + OVERLAP;
  const th = Math.ceil(full.height / rows) + OVERLAP;
  const total = cols * rows;

  // 1) barcodes: the whole picture first, then tile by tile
  onProgress({ step: "Looking for barcodes…", pct: 2 });
  if (native) {
    try {
      for (const r of await native.detect(full)) if (r.rawValue) barcodes.add(r.rawValue);
    } catch {
      /* fall back to ZXing below */
    }
  }
  const small = makeCanvas(full.width * Math.min(1, 2400 / Math.max(full.width, full.height)), full.height * Math.min(1, 2400 / Math.max(full.width, full.height)));
  small.getContext("2d")?.drawImage(full, 0, 0, small.width, small.height);
  await zxingAll(small, barcodes);

  // A barcode reader gets confused when several codes sit in one picture, so also look through small overlapping windows
  // (each holds one or two codes) at full sharpness.
  const WIN = 800;
  const WSTEP = 400;
  const wx = Math.max(1, Math.ceil((full.width - WIN) / WSTEP) + 1);
  const wy = Math.max(1, Math.ceil((full.height - WIN) / WSTEP) + 1);
  let wn = 0;
  for (let r = 0; r < wy; r++) {
    for (let c = 0; c < wx; c++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const sx = Math.min(c * WSTEP, Math.max(0, full.width - WIN));
      const sy = Math.min(r * WSTEP, Math.max(0, full.height - WIN));
      const w = Math.min(WIN, full.width - sx);
      const h = Math.min(WIN, full.height - sy);
      const win = makeCanvas(w, h);
      win.getContext("2d")?.drawImage(full, sx, sy, w, h, 0, 0, w, h);
      await zxingAll(win, barcodes);
      wn++;
      if (wn % 6 === 0) {
        onProgress({ step: `Looking for barcodes… ${barcodes.size} found`, pct: 2 + Math.round((wn / (wx * wy)) * 20) });
        await new Promise((res) => setTimeout(res, 0));
      }
    }
  }

  const worker = await getWorker(onProgress);
  const texts: string[] = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const sx = Math.max(0, Math.min(full.width - tw, c * (tw - OVERLAP)));
      const sy = Math.max(0, Math.min(full.height - th, r * (th - OVERLAP)));
      const w = Math.min(tw, full.width - sx);
      const h = Math.min(th, full.height - sy);
      const tile = makeCanvas(w, h);
      tile.getContext("2d")?.drawImage(full, sx, sy, w, h, 0, 0, w, h);
      n++;
      onProgress({ step: `Reading the print… part ${n} of ${total}`, pct: 24 + Math.round((n / total) * 74) });
      // barcodes in this tile (a copy: finding one blanks it out)
      const copy = makeCanvas(w, h);
      copy.getContext("2d")?.drawImage(tile, 0, 0);
      if (native) {
        try {
          for (const b of await native.detect(copy)) if (b.rawValue) barcodes.add(b.rawValue);
        } catch {
          /* ignore */
        }
      }
      await zxingAll(copy, barcodes);
      // printed text
      prepareForText(tile);
      const out = await worker.recognize(tile, {}, { blocks: true, text: true });
      texts.push(textInsideTile(out.data, { w, h, cutLeft: sx > 0, cutRight: sx + w < full.width - 1, cutTop: sy > 0, cutBottom: sy + h < full.height - 1 }));
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  onProgress({ step: "Done reading", pct: 100 });
  return { barcodes: [...barcodes], text: texts.join("\n"), width: bw, height: bh, tiles: total, warnings };
}
