// The Adjustment Quotation as a PDF. Same look as the Quotation Receipt (logo, blue table, disclaimer, payment
// line), with the reason for the adjustment in a box under the customer's name, and the adjusted figures in the
// table. Pure (pdf-lib, built-in fonts).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe } from "@/lib/purchasing-receipt-pdf";
import { expiryText } from "@/lib/receiving-adjustment";

export type AdjustmentPdfInput = {
  businessName: string;
  logoDataUrl?: string | null;
  draft: boolean;
  adjustmentNumber: string;
  /** "REF-… / tracking number", printed after "Re: Order Reference & Tracking #" */
  orderLabel: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  /** The reason as the customer should read it (the note, or the category when there is no note). */
  reason: string;
  lines: {
    productName: string;
    productCode?: string | null;
    /** Printed in the Note column: Mint, Damaged ... */
    condition?: string | null;
    /** A short remark printed under the product name. */
    note?: string | null;
    expiry?: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  itemsTotal: number;
  bonusAmount: number;
  deductionAmount: number;
  adjustedTotal: number;
  /** Wording from the receipt settings (the same text the Quotation Receipt prints). */
  copy: {
    disclaimerIntro: string;
    disclaimerReturnPolicy: string;
    conditionHeading: string;
    conditionBullets: string; // newline separated
    paymentTimingText: string;
    footerThankYou: string;
  };
  /** "9/18/2026, 8:20:25 AM", printed at the bottom of every page. */
  generatedAt: string;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const C = {
  ink: rgb(0.11, 0.13, 0.17),
  body: rgb(0.28, 0.32, 0.38),
  muted: rgb(0.5, 0.54, 0.6),
  faint: rgb(0.62, 0.65, 0.7),
  blue: rgb(0.114, 0.306, 0.847),
  blueBg: rgb(0.925, 0.94, 0.985),
  blueEdge: rgb(0.8, 0.85, 0.95),
  red: rgb(0.76, 0.14, 0.17),
  line: rgb(0.8, 0.83, 0.87),
  white: rgb(1, 1, 1),
};
const PAGE_W = 612;
const PAGE_H = 792;
const M = 48;
const CW = PAGE_W - M * 2;

/** "adjustment quotation" in the thank-you line, whatever the receipt settings call it. */
export function adjustmentFooterText(footer: string): string {
  if (/adjust(ed|ment)\s+quotation/i.test(footer)) return footer;
  return /\bquotation\b/i.test(footer) ? footer.replace(/\bquotation\b/i, "adjustment quotation") : footer;
}

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

/** "2026-09-18" -> "09/18/2026" */
function dateLabelOf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

export async function buildAdjustmentPdf(input: AdjustmentPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe(`Adjustment Quotation - ${input.customerName}`));
  doc.setProducer("Ledger");

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const pages: PDFPage[] = [page];
  let y = PAGE_H - M;
  const ensure = (needed: number) => {
    if (y - needed < 56) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
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
  const paragraph = (t: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, opts: { center?: boolean; gap?: number } = {}) => {
    const lh = size * 1.35;
    for (const line of wrap(t, font, size, CW)) {
      ensure(lh);
      y -= lh;
      if (opts.center) centered(line, size, font, color);
      else text(line, M, size, font, color);
    }
    y -= opts.gap ?? 0;
  };

  // --- Header: logo or two-tone wordmark, then the title
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
      centered(words.slice(1).join(" ").toUpperCase(), 14, bold, C.ink);
    } else {
      y -= 24;
      centered(words[0] ?? "", 22, bold, C.ink);
    }
  }
  y -= 34;
  centered("ADJUSTMENT QUOTATION", 21, bold, C.ink);
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: C.line });
  if (input.draft) {
    y -= 16;
    centered("DRAFT - NOT YET SENT TO THE CUSTOMER", 10, bold, C.red);
  }

  // --- Date, order, customer
  y -= 24;
  text("Date:", M, 10, regular, C.muted);
  text(dateLabelOf(input.date), M + regular.widthOfTextAtSize("Date:", 10) + 4, 10, regular, C.ink);
  y -= 18;
  const reLabel = "Re: Order Reference & Tracking #:";
  text(reLabel, M, 10, regular, C.muted);
  text(input.orderLabel, M + regular.widthOfTextAtSize(reLabel, 10) + 4, 10, regular, C.ink);
  y -= 26;
  text("ADJUSTMENT QUOTATION FOR:", M, 10, bold, C.blue);
  y -= 18;
  for (const l of wrap(input.customerName.toUpperCase(), bold, 14, CW)) {
    text(l, M, 14, bold, C.ink);
    y -= 17;
  }

  // --- Reason box
  y -= 6;
  const reasonLines = wrap(input.reason.trim() || "See the products below.", regular, 10.5, CW - 28);
  const boxH = 16 + 14 + reasonLines.length * 14 + 8;
  ensure(boxH + 12);
  page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, color: C.blueBg, borderColor: C.blueEdge, borderWidth: 0.8 });
  let ry = y - 20;
  page.drawText("REASON FOR ADJUSTMENT", { x: M + 14, y: ry, size: 9.5, font: bold, color: C.blue });
  for (const l of reasonLines) {
    ry -= 14;
    page.drawText(pdfSafe(l), { x: M + 14, y: ry, size: 10.5, font: regular, color: C.ink });
  }
  y -= boxH + 20;

  // --- Products table
  const cols = [
    { label: "#", w: 24, align: "left" as const },
    { label: "Product", w: 190, align: "left" as const },
    { label: "Note", w: 70, align: "left" as const },
    { label: "Expiry", w: 82, align: "left" as const },
    { label: "Qty", w: 34, align: "right" as const },
    { label: "Unit Price", w: 56, align: "right" as const },
    { label: "Total", w: 58, align: "right" as const },
  ];
  const colX: number[] = [];
  cols.reduce((x, c) => (colX.push(x), x + c.w), M);
  const drawHeader = () => {
    ensure(48);
    page.drawRectangle({ x: M, y: y - 24, width: CW, height: 24, color: C.blue });
    cols.forEach((c, i) => {
      const s = pdfSafe(c.label);
      const x = c.align === "right" ? colX[i] + c.w - 6 - bold.widthOfTextAtSize(s, 9) : colX[i] + 6;
      page.drawText(s, { x, y: y - 16, size: 9, font: bold, color: C.white });
    });
    y -= 24;
  };
  drawHeader();
  const SZ = 9.5;
  const LH = 12;
  input.lines.forEach((it, i) => {
    const prod = wrap(`${it.productName}${it.productCode ? ` (${it.productCode})` : ""}`, regular, SZ, cols[1].w - 12);
    const remark = it.note ? wrap(it.note, regular, 8, cols[1].w - 12) : [];
    const note = wrap(it.condition || "-", regular, SZ, cols[2].w - 12);
    const expiry = wrap(expiryText(it.expiry) || "-", regular, SZ, cols[3].w - 12);
    const lines = Math.max(prod.length + remark.length, note.length, expiry.length, 1);
    const rowH = lines * LH + 14;
    if (y - rowH < 56) {
      ensure(rowH + 30);
      drawHeader();
    }
    const top = y - 8;
    const draw = (arr: string[], x: number, font: PDFFont, color: ReturnType<typeof rgb>, size = SZ, offset = 0) =>
      arr.forEach((l, k) => page.drawText(l, { x, y: top - SZ - (k + offset) * LH + 1, size, font, color }));
    draw([String(i + 1)], colX[0] + 6, regular, C.ink);
    draw(prod, colX[1] + 6, regular, C.ink);
    draw(remark, colX[1] + 6, regular, C.muted, 8, prod.length);
    draw(note, colX[2] + 6, regular, C.ink);
    draw(expiry, colX[3] + 6, regular, C.ink);
    const num = (v: string, ci: number) => {
      const s = pdfSafe(v);
      page.drawText(s, { x: colX[ci] + cols[ci].w - 6 - regular.widthOfTextAtSize(s, SZ), y: top - SZ + 1, size: SZ, font: regular, color: C.ink });
    };
    num(String(it.quantity), 4);
    num(money(it.unitPrice), 5);
    num(money(it.lineTotal), 6);
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: C.line });
  });
  if (input.lines.length === 0) {
    y -= 24;
    text("No items on this adjustment.", M + 6, 9.5, regular, C.muted);
    y -= 8;
  }

  // --- Totals: label on the left, amount on the right, Grand Total in red
  ensure(110);
  y -= 10;
  const TL = PAGE_W - M - 190; // left edge of the totals block
  const TR = PAGE_W - M;
  const total = (label: string, value: string) => {
    y -= 18;
    text(label, TL, 11, regular, C.ink);
    right(value, TR, 11, regular, C.ink);
  };
  total("Items Total", money(input.itemsTotal));
  if (input.bonusAmount > 0) total("Bonus", `+${money(input.bonusAmount)}`);
  if (input.deductionAmount > 0) total("Deduction", `-${money(input.deductionAmount)}`);
  y -= 8;
  page.drawLine({ start: { x: TL, y }, end: { x: TR, y }, thickness: 0.8, color: C.ink });
  y -= 22;
  text("Grand Total", TL, 14, bold, C.red);
  right(money(input.adjustedTotal), TR, 14, bold, C.red);

  // --- Disclaimer (the wording from the receipt settings)
  ensure(120);
  y -= 30;
  text("DISCLAIMER:", M, 10, bold, C.ink);
  y -= 2;
  paragraph(input.copy.disclaimerIntro, 9.5, regular, C.ink, { gap: 3 });
  paragraph(input.copy.disclaimerReturnPolicy, 9.5, regular, C.ink, { gap: 12 });
  const bullets = input.copy.conditionBullets.split("\n").map((b) => b.trim()).filter(Boolean);
  if (bullets.length > 0) {
    ensure(50);
    y -= 6;
    text(input.copy.conditionHeading, M, 10, bold, C.ink);
    y -= 3;
    for (const b of bullets) {
      const lines = wrap(b, regular, 9.5, CW - 20);
      lines.forEach((l, k) => {
        ensure(13);
        y -= 13;
        if (k === 0) page.drawCircle({ x: M + 8, y: y + 3.2, size: 1.7, color: C.ink });
        text(l, M + 20, 9.5, regular, C.ink);
      });
    }
    y -= 6;
  }

  // --- Payment timing + thank-you
  ensure(70);
  y -= 8;
  paragraph(input.copy.paymentTimingText, 11, bold, C.red, { gap: 8 });
  ensure(30);
  y -= 8;
  paragraph(adjustmentFooterText(input.copy.footerThankYou), 10, regular, C.muted, { center: true });

  // --- Page numbers and the generated line, on every page
  pages.forEach((p, i) => {
    const s = `Page ${i + 1} of ${pages.length}`;
    p.drawText(s, { x: (PAGE_W - regular.widthOfTextAtSize(s, 9)) / 2, y: 40, size: 9, font: regular, color: C.muted });
    const g = pdfSafe(`Generated via the ${input.businessName} Receiving Tool on ${input.generatedAt}`);
    p.drawText(g, { x: (PAGE_W - regular.widthOfTextAtSize(g, 7.5)) / 2, y: 26, size: 7.5, font: regular, color: C.faint });
  });

  return doc.save();
}
