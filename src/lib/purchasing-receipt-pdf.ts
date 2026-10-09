// Builds the Quotation Receipt as a real PDF file (same content and order as the
// on-screen receipt page). Pure: give it the data, get bytes back. Uses pdf-lib
// with the built-in Helvetica fonts, so it needs no fonts or headless browser
// and runs fine on Vercel.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ReceiptPdfItem = {
  productName: string;
  productCode?: string | null;
  condition?: string | null;
  expiryLabel?: string | null;
  /** e.g. "Apr 2027" -- printed under the expiry as "(Apr 2027 Onwards)" */
  expiryOnwards?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReceiptPdfInput = {
  businessName: string;
  logoDataUrl?: string | null;
  quotationDate: string; // YYYY-MM-DD
  customerName: string;
  items: ReceiptPdfItem[];
  itemsTotal: number;
  bonusAmount: number;
  bonusTierLabel?: string | null;
  deductionAmount: number; // already 0 when the deduction is off
  grandTotal: number;
  /** The standing notice that is switched on today (Purchasing -> Document Templates), e.g. out-of-office dates. */
  notice?: string | null;
  copy: {
    bannerText: string;
    shippingSuffix: string;
    disclaimerIntro: string;
    disclaimerReturnPolicy: string;
    disclaimerDamageSummary: string;
    conditionHeading: string;
    conditionBullets: string; // newline separated
    paymentTimingText: string;
    paymentTimingSubtext: string;
    footerThankYou: string;
  };
};

/** Helvetica can only draw Latin-1 text: swap common typographic characters and drop anything else it can't draw (so a stray emoji never breaks a receipt). */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "*")
    .replace(/\t/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

const money = (n: number) => `$${n.toFixed(2)}`;
const C = {
  ink: rgb(0.11, 0.13, 0.17),
  body: rgb(0.28, 0.32, 0.38),
  muted: rgb(0.5, 0.54, 0.6),
  faint: rgb(0.7, 0.73, 0.78),
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
      // a single very long word: hard-split it
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

export async function buildReceiptPdf(input: ReceiptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe(`Quotation Receipt - ${input.customerName}`));
  doc.setProducer("Ledger");

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;
  const pages: PDFPage[] = [page];

  const ensure = (needed: number) => {
    if (y - needed < 46) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
      y = PAGE_H - M;
    }
  };
  const text = (t: string, x: number, size: number, font: PDFFont, color = C.ink) =>
    page.drawText(pdfSafe(t), { x, y, size, font, color });
  const centered = (t: string, size: number, font: PDFFont, color = C.ink) => {
    const s = pdfSafe(t);
    page.drawText(s, { x: (PAGE_W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };
  const right = (t: string, xRight: number, size: number, font: PDFFont, color = C.ink) => {
    const s = pdfSafe(t);
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  };
  const paragraph = (t: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, opts: { center?: boolean; indent?: number; gap?: number } = {}) => {
    const lh = size * 1.35;
    const indent = opts.indent ?? 0;
    for (const line of wrap(t, font, size, CW - indent)) {
      ensure(lh);
      y -= lh;
      if (opts.center) centered(line, size, font, color);
      else text(line, M + indent, size, font, color);
    }
    y -= opts.gap ?? 0;
  };

  // --- Header: logo or two-tone wordmark
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
  centered("Quotation Receipt", 26, bold, C.ink);
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: C.line });

  // --- Banner
  y -= 14;
  const bannerLines = wrap(input.copy.bannerText.toUpperCase(), bold, 13, CW - 24);
  const bannerH = bannerLines.length * 17 + 12;
  page.drawRectangle({ x: M, y: y - bannerH, width: CW, height: bannerH, color: C.amber });
  let by = y - 8;
  for (const l of bannerLines) {
    by -= 15;
    const s = pdfSafe(l);
    page.drawText(s, { x: (PAGE_W - bold.widthOfTextAtSize(s, 13)) / 2, y: by, size: 13, font: bold, color: C.ink });
    by -= 2;
  }
  y -= bannerH + 16;

  // --- Standing notice from Document Templates (only while it is switched on and not past its last day)
  if (input.notice && input.notice.trim()) {
    const ls = wrap(input.notice.trim(), regular, 10, CW - 24);
    const h = ls.length * 13 + 26;
    ensure(h + 12);
    const top = y;
    page.drawRectangle({ x: M, y: top - h, width: CW, height: h, color: rgb(1, 0.97, 0.86), borderColor: rgb(0.85, 0.65, 0.13), borderWidth: 0.8 });
    y = top - 15;
    text("PLEASE NOTE", M + 12, 8, bold, rgb(0.5, 0.35, 0.02));
    for (const l of ls) {
      y -= 13;
      text(l, M + 12, 10, regular, C.ink);
    }
    y = top - h - 14;
  }

  // --- Date + customer
  const d = new Date(`${input.quotationDate}T12:00:00Z`);
  const dateLabel = Number.isNaN(d.getTime())
    ? input.quotationDate
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  y -= 10;
  text(`Date: ${dateLabel}`, M, 10, regular, C.body);
  y -= 22;
  text("QUOTATION FOR:", M, 10, bold, C.blue);
  y -= 18;
  for (const l of wrap(input.customerName.toUpperCase(), bold, 14, CW)) {
    text(l, M, 14, bold, C.ink);
    y -= 17;
  }
  y -= 6;

  // --- Items table
  const cols = [
    { label: "#", w: 22, align: "left" as const },
    { label: "Product", w: 168, align: "left" as const },
    { label: "Note", w: 92, align: "left" as const },
    { label: "Expiry", w: 84, align: "left" as const },
    { label: "Qty", w: 34, align: "right" as const },
    { label: "Unit Price", w: 58, align: "right" as const },
    { label: "Total", w: 58, align: "right" as const },
  ];
  const colX: number[] = [];
  cols.reduce((x, c) => (colX.push(x), x + c.w), M);
  const drawHeader = () => {
    ensure(40);
    page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: C.blue });
    cols.forEach((c, i) => {
      const s = pdfSafe(c.label);
      const x = c.align === "right" ? colX[i] + c.w - 4 - bold.widthOfTextAtSize(s, 9) : colX[i] + 4;
      page.drawText(s, { x, y: y - 14, size: 9, font: bold, color: C.white });
    });
    y -= 20;
  };
  drawHeader();
  const SZ = 9;
  const LH = 11.5;
  input.items.forEach((it, i) => {
    const prod = wrap(`${it.productName}${it.productCode ? ` (${it.productCode})` : ""}`, bold, SZ, cols[1].w - 8);
    const note = wrap(it.condition || "-", regular, SZ, cols[2].w - 8);
    const expiry = wrap(it.expiryLabel || "-", regular, SZ, cols[3].w - 8);
    if (it.expiryOnwards) expiry.push(`(${it.expiryOnwards} Onwards)`);
    const lines = Math.max(prod.length, note.length, expiry.length, 1);
    const rowH = lines * LH + 10;
    if (y - rowH < 46) {
      ensure(rowH + 24);
      drawHeader();
    }
    const top = y - 6;
    const draw = (arr: string[], x: number, font: PDFFont, color: ReturnType<typeof rgb>) =>
      arr.forEach((l, k) => page.drawText(l, { x, y: top - SZ - k * LH + 1, size: SZ, font, color }));
    draw([String(i + 1)], colX[0] + 4, regular, C.muted);
    draw(prod, colX[1] + 4, bold, C.ink);
    draw(note, colX[2] + 4, regular, C.body);
    draw(expiry, colX[3] + 4, regular, C.body);
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
  if (input.items.length === 0) {
    y -= 22;
    text("No items on this quotation.", M + 4, 9, regular, C.muted);
    y -= 6;
  }

  // --- Totals (right aligned)
  ensure(110);
  y -= 8;
  const R = PAGE_W - M;
  y -= 14;
  right(`Items Total: ${money(input.itemsTotal)}`, R, 10, regular, C.body);
  if (input.bonusAmount > 0) {
    y -= 14;
    right(`Bonus: ${money(input.bonusAmount)}`, R, 10, regular, C.body);
    if (input.bonusTierLabel) {
      y -= 12;
      right(input.bonusTierLabel, R, 8, regular, C.muted);
    }
  }
  if (input.deductionAmount > 0) {
    y -= 14;
    right(`Deduction: -${money(input.deductionAmount)}`, R, 10, regular, C.body);
  }
  y -= 20;
  right(`Grand Total: ${money(input.grandTotal)}`, R, 14, bold, C.red);

  // --- "Total will be ..." box
  ensure(50);
  y -= 14;
  const totalMsg = `Total will be ${money(input.grandTotal)} ${input.copy.shippingSuffix}`;
  const tl = wrap(totalMsg, bold, 12, CW - 24);
  const tH = tl.length * 16 + 14;
  page.drawRectangle({ x: M, y: y - tH, width: CW, height: tH, color: C.blueBg });
  let ty = y - 10;
  for (const l of tl) {
    ty -= 13;
    const s = pdfSafe(l);
    page.drawText(s, { x: (PAGE_W - bold.widthOfTextAtSize(s, 12)) / 2, y: ty, size: 12, font: bold, color: C.ink });
    ty -= 3;
  }
  y -= tH + 18;

  // --- Disclaimer
  ensure(60);
  y -= 6;
  text("DISCLAIMER:", M, 10, bold, C.blue);
  y -= 4;
  paragraph(input.copy.disclaimerIntro, 8.5, regular, C.body, { gap: 4 });
  paragraph(input.copy.disclaimerReturnPolicy, 8.5, regular, C.body, { gap: 4 });
  paragraph(input.copy.disclaimerDamageSummary, 8.5, regular, C.body, { gap: 6 });
  const bullets = input.copy.conditionBullets.split("\n").map((b) => b.trim()).filter(Boolean);
  if (bullets.length > 0) {
    ensure(40);
    y -= 8;
    text(input.copy.conditionHeading, M, 10, bold, C.blue);
    y -= 4;
    bullets.forEach((b, i) => {
      const font = i === bullets.length - 1 ? bold : regular;
      const lines = wrap(b, font, 8.5, CW - 16);
      lines.forEach((l, k) => {
        ensure(12);
        y -= 11.5;
        if (k === 0) text("*", M + 4, 8.5, bold, C.body);
        text(l, M + 14, 8.5, font, C.body);
      });
      y -= 1.5;
    });
  }

  // --- Payment timing + footer
  ensure(78);
  y -= 8;
  paragraph(input.copy.paymentTimingText, 10, bold, C.red, { center: true, gap: 2 });
  paragraph(input.copy.paymentTimingSubtext, 8.5, regular, C.muted, { center: true, gap: 6 });
  ensure(30);
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: C.line });
  y -= 6;
  paragraph(input.copy.footerThankYou, 8.5, regular, C.muted, { center: true });

  // --- Page numbers
  pages.forEach((p, i) => {
    const s = `Page ${i + 1} of ${pages.length}`;
    p.drawText(s, { x: (PAGE_W - regular.widthOfTextAtSize(s, 8)) / 2, y: 28, size: 8, font: regular, color: C.faint });
  });

  return doc.save();
}
