// Copies the photo-reading engine (Tesseract OCR) into public/ocr so the app serves it itself.
// Group-photo reading then works with no outside service: the picture never leaves the phone or computer, and the
// engine files are not fetched from anyone else's server. Runs before `next dev` and `next build`.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");
mkdirSync(out, { recursive: true });

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];

let missing = 0;
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[ocr] missing ${from} (run npm install)`);
    missing++;
    continue;
  }
  copyFileSync(src, join(out, to));
}
if (missing) console.warn("[ocr] photo reading will not work until these files are installed.");
else console.log("[ocr] photo-reading files are in public/ocr");
