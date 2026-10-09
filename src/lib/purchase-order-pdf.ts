// Builds a purchase order as a real PDF, in the layout distributors and wholesalers already use: the sender's name and logo at the
// top, a gray-barred block each for the Supplier (with its license), Ship To / Bill To and Reference / Comments, the items table
// (part number, NDC, name, size, quantity, unit, net cost, total), the totals and the terms at the foot. Pure: give it the
// data, get bytes back (pdf-lib with the built-in Helvetica, so it needs no fonts and runs on Vercel).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe } from "@/lib/purchasing-receipt-pdf";
import { wrap } from "@/lib/sales-pdf";
import { PO_STATUS_LABEL, isPoStatus, money, usDate } from "@/lib/purchase-order-rules";

export type PoPdfLine = { partNumber: string | null; ndc: string | null; name: string; size: string | null; quantity: number; unit: string; unitCost: number; total: number };

export type PoPdfInput = {
  number: string;
  status: string;
  issueDate: string; // YYYY-MM-DD
  from: { name: string; address: string | null; phone: string | null; email: string | null; logoDataUrl: string | null };
  supplier: { name: string; address: string | null; email: string | null; license: string | null; licenseExpires: string | null };
  shipTo: { name: string | null; address: string | null };
  billTo: { name: string | null; address: string | null };
  reference: string | null;
  comments: string | null;
  terms: string | null;
  lines: PoPdfLine[];
  subtotal: number;
  shipping: number;
  total: number;
  /** From the company's Purchase Order template (all optional). */
  title?: string | null;
  intro?: string | null;
  footer?: string | null;
  /** The standing notice that is switched on today (e.g. out-of-office), already checked against its end date. */
  notice?: string | null;
  /** Revision number (1, 2, ...) and the note that went with it. */
  revision?: number | null;
  revisionNote?: string | null;
};

const PAGE_W = 612;
const PAGE_H = 792;
const M = 40;
const CONTENT_W = PAGE_W - 2 * M;
const INK = rgb(0.07, 0.08, 0.1);
const MUT = rgb(0.42, 0.45, 0.5);
const BAR = rgb(0.92, 0.93, 0.94);
const RULE = rgb(0.82, 0.84, 0.87);
const ACC = rgb(0.0, 0.34, 0.24);
const RED = rgb(0.72, 0.11, 0.11);
const AMBER_BG = rgb(1, 0.97, 0.86);
const AMBER_LINE = rgb(0.85, 0.65, 0.13);
const RED_BG = rgb(0.99, 0.93, 0.93);

export async function buildPurchaseOrderPdf(input: PoPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe(`Purchase Order ${input.number} - ${input.supplier.name}`));
  doc.setProducer("Ledger");

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const pages: PDFPage[] = [page];
  let y = PAGE_H - 44;

  const draw = (t: string, x: number, size: number, font: PDFFont, color = INK, yy = y) => page.drawText(pdfSafe(t), { x, y: yy, size, font, color });
  const drawRight = (t: string, xRight: number, size: number, font: PDFFont, color = INK, yy = y) => {
    const s = pdfSafe(t);
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y: yy, size, font, color });
  };
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - M;
  };
  const ensure = (needed: number) => {
    if (y - needed < 64) newPage();
  };
  /** A gray bar with a bold title, the way the sample orders mark each block. */
  const bar = (title: string, x: number, w: number) => {
    page.drawRectangle({ x, y: y - 17, width: w, height: 19, color: BAR });
    draw(title, x + 6, 9, bold, INK, y - 11);
  };

  // ---- Header: sender on the left, the order number on the right
  let leftY = y;
  if (input.from.logoDataUrl) {
    try {
      const m = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(input.from.logoDataUrl);
      if (m) {
        const bytes = Buffer.from(m[2], "base64");
        const img = /png/i.test(m[1]) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const h = 42;
        const w = Math.min(170, (img.width / img.height) * h);
        page.drawImage(img, { x: M, y: leftY - h + 10, width: w, height: h });
        leftY -= h + 6;
      }
    } catch {
      /* a logo that can't be read is simply left off */
    }
  }
  draw(input.from.name, M, 14, bold, INK, leftY);
  leftY -= 14;
  for (const l of wrap(input.from.address ?? "", regular, 9, 250)) {
    if (!l) continue;
    draw(l, M, 9, regular, MUT, leftY);
    leftY -= 11.5;
  }
  for (const l of [input.from.phone, input.from.email]) {
    if (!l) continue;
    draw(l, M, 9, regular, MUT, leftY);
    leftY -= 11.5;
  }
  const right = PAGE_W - M;
  drawRight(input.title?.trim() ? input.title.trim() : "PURCHASE ORDER", right, 9, bold, MUT, y);
  drawRight(`#${input.number}`, right, 24, bold, ACC, y - 26);
  let rightY = y - 44;
  if (input.revision && input.revision > 0) {
    drawRight(`REVISION ${Math.floor(input.revision)}`, right, 11, bold, RED, rightY);
    rightY -= 14;
  }
  drawRight(`Issue date  ${usDate(input.issueDate)}`, right, 9.5, regular, INK, rightY);
  rightY -= 14;
  if (input.status !== "SENT" && input.status !== "CONFIRMED" && input.status !== "RECEIVED") {
    const label = (isPoStatus(input.status) ? PO_STATUS_LABEL[input.status] : input.status).toUpperCase();
    drawRight(label, right, 11, bold, input.status === "CANCELLED" ? RED : MUT, rightY);
    rightY -= 14;
  }
  y = Math.min(leftY, rightY) - 16;

  // ---- Callouts: what changed in this revision, then the company's standing notice, then its opening wording
  const callout = (label: string, text: string, bg: ReturnType<typeof rgb>, line: ReturnType<typeof rgb>) => {
    const ls = wrap(text, regular, 9.5, CONTENT_W - 20).filter((l, i, a) => l || i < a.length - 1);
    const h = 22 + ls.length * 12;
    ensure(h + 10);
    page.drawRectangle({ x: M, y: y - h + 6, width: CONTENT_W, height: h, color: bg, borderColor: line, borderWidth: 0.8 });
    draw(label.toUpperCase(), M + 10, 8, bold, line === AMBER_LINE ? rgb(0.5, 0.35, 0.02) : RED, y - 8);
    ls.forEach((l, i) => draw(l, M + 10, 9.5, regular, INK, y - 22 - i * 12));
    y -= h + 8;
  };
  if (input.revision && input.revision > 0 && input.revisionNote?.trim()) callout(`Revision ${Math.floor(input.revision)} - what changed`, input.revisionNote.trim(), RED_BG, RED);
  if (input.notice?.trim()) callout("Please note", input.notice.trim(), AMBER_BG, AMBER_LINE);
  if (input.intro?.trim()) {
    for (const l of wrap(input.intro.trim(), regular, 9.5, CONTENT_W)) {
      ensure(13);
      draw(l, M, 9.5, regular, INK);
      y -= 12;
    }
    y -= 6;
  }

  // ---- Supplier | Documents
  const half = (CONTENT_W - 10) / 2;
  const xR = M + half + 10;
  bar("Supplier", M, half);
  bar("Documents", xR, half);
  let sy = y - 32;
  let dy = y - 32;
  draw(input.supplier.name, M + 6, 10, bold, INK, sy);
  sy -= 13;
  for (const l of wrap(input.supplier.address ?? "", regular, 9, half - 12)) {
    if (!l) continue;
    draw(l, M + 6, 9, regular, INK, sy);
    sy -= 11.5;
  }
  if (input.supplier.email) {
    draw(input.supplier.email, M + 6, 9, regular, MUT, sy);
    sy -= 11.5;
  }
  draw("License #:", xR + 6, 9, bold, INK, dy);
  draw(input.supplier.license || "-", xR + 70, 9, regular, INK, dy);
  dy -= 12;
  draw("License expires:", xR + 6, 9, bold, INK, dy);
  draw(input.supplier.licenseExpires ? usDate(input.supplier.licenseExpires) : "-", xR + 90, 9, regular, INK, dy);
  dy -= 12;
  y = Math.min(sy, dy) - 8;

  // ---- Ship To | Bill To
  bar("Ship To", M, half);
  bar("Bill To", xR, half);
  let a = y - 32;
  let b = y - 32;
  const block = (who: { name: string | null; address: string | null }, x: number, startY: number) => {
    let yy = startY;
    if (who.name) {
      draw(who.name, x + 6, 10, bold, INK, yy);
      yy -= 13;
    }
    for (const l of wrap(who.address ?? "", regular, 9, half - 12)) {
      if (!l) continue;
      draw(l, x + 6, 9, regular, INK, yy);
      yy -= 11.5;
    }
    return yy;
  };
  a = block(input.shipTo, M, a);
  b = block(input.billTo, xR, b);
  y = Math.min(a, b) - 8;

  // ---- Reference | Comments
  bar("Reference", M, half);
  bar("Comments", xR, half);
  let r1 = y - 32;
  let r2 = y - 32;
  for (const l of wrap(input.reference ?? "", regular, 9, half - 12)) {
    draw(l, M + 6, 9, regular, INK, r1);
    r1 -= 11.5;
  }
  for (const l of wrap(input.comments ?? "", regular, 9, half - 12)) {
    draw(l, xR + 6, 9, regular, INK, r2);
    r2 -= 11.5;
  }
  y = Math.min(r1, r2, y - 32 + 8) - 10;

  // ---- Items table
  const cols = [
    { head: "Part Number", w: 80, align: "left" as const },
    { head: "NDC", w: 82, align: "left" as const },
    { head: "Name", w: 142, align: "left" as const },
    { head: "Size", w: 40, align: "left" as const },
    { head: "Qty", w: 32, align: "right" as const },
    { head: "UN", w: 28, align: "left" as const },
    { head: "Net Cost $", w: 58, align: "right" as const },
    { head: "Total $", w: 70, align: "right" as const },
  ];
  let x0 = M;
  const xs = cols.map((c) => {
    const x = x0;
    x0 += c.w;
    return x;
  });
  const head = () => {
    page.drawRectangle({ x: M, y: y - 17, width: CONTENT_W, height: 19, color: BAR });
    cols.forEach((c, i) => {
      if (c.align === "right") drawRight(c.head, xs[i] + c.w - 5, 8.5, bold, INK, y - 11);
      else draw(c.head, xs[i] + 5, 8.5, bold, INK, y - 11);
    });
    y -= 19;
  };
  head();
  const FS = 8.5;
  for (const l of input.lines) {
    const cells = [
      wrap(l.partNumber ?? "", regular, FS, cols[0].w - 8),
      wrap(l.ndc ?? "", regular, FS, cols[1].w - 8),
      wrap(l.name, regular, FS, cols[2].w - 8),
      wrap(l.size ?? "", regular, FS, cols[3].w - 8),
    ];
    const n = Math.max(1, ...cells.map((c) => c.length));
    const rowH = n * 11 + 9;
    if (y - rowH < 90) {
      newPage();
      head();
    }
    const top = y - 12;
    cells.forEach((lines, i) => lines.forEach((t, k) => draw(t, xs[i] + 5, FS, regular, INK, top - k * 11)));
    drawRight(String(l.quantity), xs[4] + cols[4].w - 5, FS, regular, INK, top);
    draw(l.unit, xs[5] + 5, FS, regular, INK, top);
    drawRight(money(l.unitCost), xs[6] + cols[6].w - 5, FS, regular, INK, top);
    drawRight(money(l.total), xs[7] + cols[7].w - 5, FS, bold, INK, top);
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + CONTENT_W, y: y - rowH }, thickness: 0.5, color: RULE });
    y -= rowH;
  }

  // ---- Totals
  ensure(70);
  y -= 16;
  const labX = M + CONTENT_W - 100;
  const put = (k: string, v: string, big = false) => {
    drawRight(k, labX, big ? 11 : 9.5, big ? bold : regular, big ? INK : MUT);
    drawRight(v, right, big ? 12 : 9.5, bold, big ? ACC : INK);
    y -= big ? 18 : 14;
  };
  put("Total", money(input.subtotal));
  put("Shipping", money(input.shipping));
  page.drawLine({ start: { x: labX - 60, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 1, color: INK });
  y -= 4;
  put("Grand Total", money(input.total), true);
  y -= 6;

  // ---- Terms
  if (input.terms && input.terms.trim()) {
    const termLines = wrap(input.terms.trim(), regular, 8.5, CONTENT_W);
    ensure(14 + termLines.length * 11);
    draw("TERMS", M, 8, bold, MUT);
    y -= 12;
    for (const l of termLines) {
      ensure(11);
      draw(l, M, 8.5, regular, INK);
      y -= 11;
    }
  }

  // ---- Closing wording from the template
  if (input.footer && input.footer.trim()) {
    y -= 6;
    for (const l of wrap(input.footer.trim(), regular, 8.5, CONTENT_W)) {
      ensure(11);
      draw(l, M, 8.5, regular, MUT);
      y -= 11;
    }
  }

  // ---- Footer on every page: who sent it, the order number and the page
  const foot = [input.from.name, (input.from.address ?? "").replace(/\s*\n\s*/g, ", "), input.from.phone].filter(Boolean).join("  |  ");
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: PAGE_W - M, y: 44 }, thickness: 0.5, color: RULE });
    const t = pdfSafe(foot).slice(0, 120);
    p.drawText(t, { x: M, y: 30, size: 8, font: regular, color: MUT });
    const n = `${input.revision && input.revision > 0 ? `${input.number} Rev ${Math.floor(input.revision)}` : input.number}  |  Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: PAGE_W - M - regular.widthOfTextAtSize(n, 8), y: 30, size: 8, font: regular, color: MUT });
  });

  return doc.save();
}
