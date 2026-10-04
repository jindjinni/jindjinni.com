// The Adjusted Quotation as a PDF: the same look as the Quotation Receipt, but showing what was
// originally quoted next to the adjusted figures, the reason, and the new total. Pure (pdf-lib, built-in fonts).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe } from "@/lib/purchasing-receipt-pdf";

export type AdjustmentPdfInput = {
  businessName: string;
  logoDataUrl?: string | null;
  draft: boolean;
  adjustmentNumber: string;
  orderLabel: string; // "REF-… — tracking"
  date: string; // YYYY-MM-DD
  customerName: string;
  reason: string; // category
  reasonNotes: string;
  lines: {
    productName: string;
    productCode?: string | null;
    condition?: string | null;
    note?: string | null;
    originalQuantity: number | null;
    originalUnitPrice: number | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  originalTotal: number;
  itemsTotal: number;
  bonusAmount: number;
  deductionAmount: number;
  adjustedTotal: number;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const signed = (n: number) => `${n < 0 ? "-" : n > 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
const C = {
  ink: rgb(0.11, 0.13, 0.17),
  body: rgb(0.28, 0.32, 0.38),
  muted: rgb(0.5, 0.54, 0.6),
  blue: rgb(0.114, 0.306, 0.847),
  blueBg: rgb(0.937, 0.965, 1),
  red: rgb(0.86, 0.15, 0.15),
  amber: rgb(0.99, 0.83, 0.3),
  line: rgb(0.8, 0.83, 0.87),
  white: rgb(1, 1, 1),
};
const PAGE_W = 612;
const PAGE_H = 792;
const M = 48;
const CW = PAGE_W - M * 2;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
        continue;
      }
      if (line) out.push(line);
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxWidth) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

export async function buildAdjustmentPdf(input: AdjustmentPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe(`Adjusted Quotation - ${input.customerName}`));
  doc.setProducer("Ledger");

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;
  const ensure = (needed: number) => {
    if (y - needed < 46) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };
  const text = (t: string, x: number, size: number, font: PDFFont, color = C.ink) => page.drawText(pdfSafe(t), { x, y, size, font, color });
  const centered = (t: string, size: number, font: PDFFont, color = C.ink) => {
    const s = pdfSafe(t);
    page.drawText(s, { x: (PAGE_W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };
  const right = (t: string, xRight: number, size: number, font: PDFFont, color = C.ink) => {
    const s = pdfSafe(t);
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  };
  const paragraph = (t: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, gap = 0) => {
    const lh = size * 1.35;
    for (const line of wrap(t, font, size, CW)) {
      ensure(lh);
      y -= lh;
      text(line, M, size, font, color);
    }
    y -= gap;
  };

  // header
  let drewLogo = false;
  if (input.logoDataUrl) {
    try {
      const m = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(input.logoDataUrl);
      if (m) {
        const bytes = Buffer.from(m[2], "base64");
        const img = /png/i.test(m[1]) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const h = 48;
        const w = Math.min(CW, (img.width / img.height) * h);
        y -= h;
        page.drawImage(img, { x: (PAGE_W - w) / 2, y, width: w, height: h });
        drewLogo = true;
      }
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    const words = pdfSafe(input.businessName).split(" ").filter(Boolean);
    if (words.length > 1) {
      y -= 24;
      centered(words[0], 22, bold, C.red);
      y -= 18;
      centered(words.slice(1).join(" ").toUpperCase(), 14, bold, C.blue);
    } else {
      y -= 24;
      centered(words[0] ?? "", 22, bold, C.ink);
    }
  }
  y -= 34;
  centered("Adjusted Quotation", 26, bold, C.ink);
  y -= 16;
  centered(`${input.adjustmentNumber}  |  Order ${input.orderLabel}`, 9, regular, C.muted);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: C.line });
  if (input.draft) {
    y -= 16;
    centered("DRAFT - NOT YET SENT TO THE CUSTOMER", 10, bold, C.red);
  }

  // date + customer
  const d = new Date(`${input.date}T12:00:00Z`);
  const dateLabel = Number.isNaN(d.getTime()) ? input.date : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  y -= 22;
  text(`Date: ${dateLabel}`, M, 10, regular, C.body);
  y -= 22;
  text("ADJUSTED QUOTATION FOR:", M, 10, bold, C.blue);
  y -= 18;
  for (const l of wrap(input.customerName.toUpperCase(), bold, 14, CW)) {
    text(l, M, 14, bold, C.ink);
    y -= 17;
  }

  // reason
  y -= 4;
  const reasonHead = `REASON FOR ADJUSTMENT: ${input.reason || "See details"}`;
  const reasonLines = wrap(reasonHead.toUpperCase(), bold, 11, CW - 24);
  const rH = reasonLines.length * 15 + 12;
  ensure(rH + 10);
  page.drawRectangle({ x: M, y: y - rH, width: CW, height: rH, color: C.amber });
  let ry = y - 8;
  for (const l of reasonLines) {
    ry -= 13;
    const s = pdfSafe(l);
    page.drawText(s, { x: (PAGE_W - bold.widthOfTextAtSize(s, 11)) / 2, y: ry, size: 11, font: bold, color: C.ink });
    ry -= 2;
  }
  y -= rH + 10;
  if (input.reasonNotes.trim()) {
    paragraph(input.reasonNotes, 9.5, regular, C.body, 8);
  }

  // table
  const cols = [
    { label: "#", w: 20, align: "left" as const },
    { label: "Product", w: 178, align: "left" as const },
    { label: "Condition", w: 78, align: "left" as const },
    { label: "Originally quoted", w: 92, align: "left" as const },
    { label: "Qty", w: 34, align: "right" as const },
    { label: "Unit Price", w: 56, align: "right" as const },
    { label: "Total", w: 58, align: "right" as const },
  ];
  const colX: number[] = [];
  cols.reduce((x, c) => (colX.push(x), x + c.w), M);
  const drawHeader = () => {
    ensure(40);
    page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: C.blue });
    cols.forEach((c, i) => {
      const s = pdfSafe(c.label);
      const x = c.align === "right" ? colX[i] + c.w - 4 - bold.widthOfTextAtSize(s, 8.5) : colX[i] + 4;
      page.drawText(s, { x, y: y - 14, size: 8.5, font: bold, color: C.white });
    });
    y -= 20;
  };
  drawHeader();
  const SZ = 9;
  const LH = 11.5;
  input.lines.forEach((it, i) => {
    const prod = wrap(`${it.productName}${it.productCode ? ` (${it.productCode})` : ""}`, bold, SZ, cols[1].w - 8);
    const noteLines = it.note ? wrap(it.note, regular, 8, cols[1].w - 8) : [];
    const cond = wrap(it.condition || "-", regular, SZ, cols[2].w - 8);
    const was = it.originalQuantity == null ? ["Not quoted"] : [`${it.originalQuantity} x ${money(it.originalUnitPrice ?? 0)}`];
    const lines = Math.max(prod.length + noteLines.length, cond.length, was.length, 1);
    const rowH = lines * LH + 10;
    if (y - rowH < 46) {
      ensure(rowH + 24);
      drawHeader();
    }
    const top = y - 6;
    const draw = (arr: string[], x: number, font: PDFFont, color: ReturnType<typeof rgb>, size = SZ, offset = 0) =>
      arr.forEach((l, k) => page.drawText(l, { x, y: top - SZ - (k + offset) * LH + 1, size, font, color }));
    draw([String(i + 1)], colX[0] + 4, regular, C.muted);
    draw(prod, colX[1] + 4, bold, C.ink);
    draw(noteLines, colX[1] + 4, regular, C.muted, 8, prod.length);
    draw(cond, colX[2] + 4, regular, C.body);
    draw(was, colX[3] + 4, regular, C.muted);
    const num = (v: string, ci: number, font: PDFFont) => {
      const s = pdfSafe(v);
      page.drawText(s, { x: colX[ci] + cols[ci].w - 4 - font.widthOfTextAtSize(s, SZ), y: top - SZ + 1, size: SZ, font, color: C.ink });
    };
    num(String(it.quantity), 4, regular);
    num(money(it.unitPrice), 5, regular);
    num(money(it.lineTotal), 6, bold);
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: C.line });
  });
  if (input.lines.length === 0) {
    y -= 22;
    text("No items on this adjustment.", M + 4, 9, regular, C.muted);
    y -= 6;
  }

  // totals
  ensure(130);
  y -= 8;
  const R = PAGE_W - M;
  y -= 14;
  right(`Original Quotation: ${money(input.originalTotal)}`, R, 10, regular, C.body);
  y -= 14;
  right(`Adjusted Items Total: ${money(input.itemsTotal)}`, R, 10, regular, C.body);
  if (input.bonusAmount > 0) {
    y -= 14;
    right(`Bonus: ${money(input.bonusAmount)}`, R, 10, regular, C.body);
  }
  if (input.deductionAmount > 0) {
    y -= 14;
    right(`Deduction: -${money(input.deductionAmount)}`, R, 10, regular, C.body);
  }
  y -= 14;
  right(`Adjustment: ${signed(Math.round((input.adjustedTotal - input.originalTotal) * 100) / 100)}`, R, 10, bold, C.body);
  y -= 22;
  right(`Adjusted Total: ${money(input.adjustedTotal)}`, R, 14, bold, C.red);

  ensure(50);
  y -= 16;
  const msg = `Your adjusted total is ${money(input.adjustedTotal)} (originally ${money(input.originalTotal)}).`;
  const ml = wrap(msg, bold, 12, CW - 24);
  const mH = ml.length * 16 + 14;
  page.drawRectangle({ x: M, y: y - mH, width: CW, height: mH, color: C.blueBg });
  let my = y - 10;
  for (const l of ml) {
    my -= 13;
    const s = pdfSafe(l);
    page.drawText(s, { x: (PAGE_W - bold.widthOfTextAtSize(s, 12)) / 2, y: my, size: 12, font: bold, color: C.ink });
    my -= 3;
  }
  y -= mH + 18;
  paragraph("This adjusted quotation replaces the original quotation for this order. It reflects the supplies and condition actually received on inspection.", 8.5, regular, C.body, 10);
  ensure(30);
  y -= 6;
  centered(`Thank you for choosing ${input.businessName}.`, 10, bold, C.ink);

  return doc.save();
}
