// Puts several invoice PDFs into one file, in the order given, so an audit email carries one "Invoice copies" attachment instead of a
// pile of them. Pure: bytes in, bytes out.

import { PDFDocument } from "pdf-lib";

export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}
