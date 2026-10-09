// Builds a Sales quotation or invoice as a real PDF, in the layout the company already uses: the company on the left,
// the big document number on the right, Bill To / Ship To, a blue table of items (item, expires, condition, quantity,
// unit price, amount), the totals, notes, and a thank-you footer. Pure: give it the data, get bytes back (pdf-lib with
// the built-in Helvetica, so it needs no fonts and runs on Vercel).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe } from "@/lib/purchasing-receipt-pdf";

export type SalesPdfLine = { productName: string; expiryText: string | null; condition: string; quantity: number; unitPrice: number; amount: number };

export type SalesPdfInput = {
  kind: "QUOTATION" | "INVOICE";
  number: string;
  status: string;
  docDate: string; // YYYY-MM-DD
  dueDate: string | null;
  terms: string | null;
  reference: string | null;
  from: { name: string; address: string | null; phone: string | null; email: string | null; logoDataUrl: string | null };
  buyer: { company: string; contact: string | null; billing: string | null; shipping: string | null; email: string | null; phone: string | null };
  lines: SalesPdfLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  otherCharges: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  footer: string | null;
};

const PAGE_W = 612;
const PAGE_H = 792;
const M = 50;
const ACC = rgb(0, 112 / 255, 186 / 255);
const MUT = rgb(107 / 255, 114 / 255, 128 / 255);
const INK = rgb(0, 0, 0);
const RULE = rgb(217 / 255, 221 / 255, 226 / 255);
const ZEBRA = rgb(247 / 255, 249 / 255, 251 / 255);

const money = (n: number) => "$" + (Number.isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function longDate(day: string | null): string {
  if (!day) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  // Split into lines first: pdfSafe drops everything outside printable characters, and that includes the line breaks of an address.
  for (const para of text.replace(/\r/g, "").split("\n").map((p) => pdfSafe(p))) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
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

export function pdfFileName(kind: "QUOTATION" | "INVOICE", number: string, buyer: string): string {
  const label = kind === "INVOICE" ? "Invoice" : "Quotation";
  const who = buyer.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${label}-${number.replace(/[^A-Za-z0-9-]+/g, "")}${who ? `-${who}` : ""}.pdf`;
}

export async function buildSalesPdf(input: SalesPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const label = input.kind === "INVOICE" ? "INVOICE" : "QUOTATION";
  doc.setTitle(pdfSafe(`${label} ${input.number} - ${input.buyer.company}`));
  doc.setProducer("Ledger");

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const pages: PDFPage[] = [page];
  let y = PAGE_H - 52;

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
    if (y - needed < 70) newPage();
  };

  // ---- Top left: logo (if any), company name, address, phone, email
  let leftY = y;
  if (input.from.logoDataUrl) {
    try {
      const m = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(input.from.logoDataUrl);
      if (m) {
        const bytes = Buffer.from(m[2], "base64");
        const img = /png/i.test(m[1]) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const h = 40;
        const w = Math.min(160, (img.width / img.height) * h);
        page.drawImage(img, { x: M, y: leftY - h + 10, width: w, height: h });
        leftY -= h + 6;
      }
    } catch {
      /* a logo that can't be read is simply left off */
    }
  }
  draw(input.from.name, M, 15, bold, INK, leftY);
  leftY -= 15;
  for (const l of wrap(input.from.address ?? "", regular, 9, 240)) {
    if (l === "" && !input.from.address) continue;
    draw(l, M, 9, regular, MUT, leftY);
    leftY -= 12;
  }
  if (input.from.phone) {
    draw(input.from.phone, M, 9, regular, MUT, leftY);
    leftY -= 12;
  }
  if (input.from.email) {
    draw(input.from.email, M, 9, regular, MUT, leftY);
    leftY -= 12;
  }

  // ---- Top right: INVOICE, #number, dates
  drawRight(label, PAGE_W - M, 9, bold, MUT, y);
  drawRight(`#${input.number}`, PAGE_W - M, 26, bold, ACC, y - 26);
  let rightY = y - 46;
  drawRight(`Date  ${longDate(input.docDate)}`, PAGE_W - M, 9, regular, INK, rightY);
  rightY -= 13;
  if (input.dueDate) {
    drawRight(`${input.kind === "INVOICE" ? "Due" : "Valid until"}  ${longDate(input.dueDate)}`, PAGE_W - M, 9, regular, INK, rightY);
    rightY -= 13;
  }
  if (input.terms && input.kind === "INVOICE") {
    drawRight(`Terms  ${input.terms}`, PAGE_W - M, 9, regular, INK, rightY);
    rightY -= 13;
  }
  if (input.status === "VOID") {
    drawRight("VOID", PAGE_W - M, 12, bold, rgb(0.72, 0.11, 0.11), rightY - 2);
    rightY -= 16;
  }

  y = Math.min(leftY, rightY) - 22;

  // ---- Bill to / Ship to
  const colR = M + 290;
  draw("BILL TO", M, 8, bold, MUT);
  draw("SHIP TO", colR, 8, bold, MUT);
  let by = y - 15;
  let sy = y - 15;
  draw(input.buyer.company, M, 10.5, bold, INK, by);
  by -= 14;
  draw(input.buyer.company, colR, 10.5, bold, INK, sy);
  sy -= 14;
  if (input.buyer.contact) {
    draw(input.buyer.contact, M, 9.5, regular, INK, by);
    by -= 12;
  }
  for (const l of wrap(input.buyer.billing ?? "", regular, 9.5, 240)) {
    draw(l, M, 9.5, regular, MUT, by);
    by -= 12;
  }
  if (input.buyer.email) {
    draw(input.buyer.email, M, 9.5, regular, MUT, by);
    by -= 12;
  }
  if (input.buyer.phone) {
    draw(input.buyer.phone, M, 9.5, regular, MUT, by);
    by -= 12;
  }
  for (const l of wrap((input.buyer.shipping ?? "").trim() || (input.buyer.billing ?? ""), regular, 9.5, 240)) {
    draw(l, colR, 9.5, regular, MUT, sy);
    sy -= 12;
  }
  if (input.reference) {
    sy -= 6;
    draw("REFERENCE", colR, 8, bold, MUT, sy);
    sy -= 13;
    draw(input.reference, colR, 9.5, regular, INK, sy);
    sy -= 12;
  }
  y = Math.min(by, sy) - 18;

  // ---- Items table
  const cols = [
    { head: "ITEM", x: M + 7, w: 190, align: "left" as const },
    { head: "EXPIRES", x: M + 197, w: 66, align: "left" as const },
    { head: "COND.", x: M + 263, w: 52, align: "left" as const },
    { head: "QTY", x: M + 315, w: 36, align: "right" as const },
    { head: "UNIT PRICE", x: M + 351, w: 72, align: "right" as const },
    { head: "AMOUNT", x: M + 423, w: 79, align: "right" as const },
  ];
  const tableW = PAGE_W - 2 * M;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 20, width: tableW, height: 22, color: ACC });
    for (const c of cols) {
      if (c.align === "right") drawRight(c.head, c.x + c.w - 7, 8, bold, rgb(1, 1, 1), y - 14);
      else draw(c.head, c.x, 8, bold, rgb(1, 1, 1), y - 14);
    }
    y -= 22;
  };
  head();
  input.lines.forEach((l, i) => {
    const nameLines = wrap(l.productName, regular, 9.3, cols[0].w - 10);
    const rowH = Math.max(1, nameLines.length) * 11.5 + 12;
    if (y - rowH < 90) {
      newPage();
      head();
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: tableW, height: rowH, color: ZEBRA });
    const top = y - 14;
    nameLines.forEach((nl, k) => draw(nl, cols[0].x, 9.3, regular, INK, top - k * 11.5));
    draw(l.expiryText ?? "", cols[1].x, 9.3, regular, MUT, top);
    draw(l.condition, cols[2].x, 9.3, regular, MUT, top);
    drawRight(String(l.quantity), cols[3].x + cols[3].w - 7, 9.3, regular, INK, top);
    drawRight(money(l.unitPrice), cols[4].x + cols[4].w - 7, 9.3, regular, INK, top);
    drawRight(money(l.amount), cols[5].x + cols[5].w - 7, 9.3, bold, INK, top);
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + tableW, y: y - rowH }, thickness: 0.5, color: RULE });
    y -= rowH;
  });

  // ---- Totals
  const extra = [
    ["Discount", input.discount, -1],
    ["Shipping", input.shipping, 1],
    ["Tax", input.tax, 1],
    ["Other", input.otherCharges, 1],
  ] as const;
  const shown = extra.filter(([, v]) => v);
  ensure(60 + shown.length * 15 + (input.amountPaid > 0 ? 36 : 0));
  y -= 20;
  const labX = PAGE_W - M - 110;
  const put = (k: string, v: string) => {
    drawRight(k, labX, 9.5, regular, MUT);
    drawRight(v, PAGE_W - M, 9.5, regular, INK);
    y -= 15;
  };
  put("Subtotal", money(input.subtotal));
  for (const [k, v, sign] of shown) put(k, (sign < 0 ? "-" : "") + money(Math.abs(v)));
  y -= 4;
  page.drawLine({ start: { x: labX - 40, y }, end: { x: PAGE_W - M, y }, thickness: 1.2, color: INK });
  y -= 18;
  drawRight(input.kind === "INVOICE" ? "TOTAL DUE" : "TOTAL", labX, 13, bold, INK);
  drawRight(money(input.total), PAGE_W - M, 15, bold, ACC);
  y -= 18;
  if (input.kind === "INVOICE" && input.amountPaid > 0) {
    put("Paid", "-" + money(input.amountPaid));
    drawRight("BALANCE DUE", labX, 11, bold, INK);
    drawRight(money(Math.max(0, input.total - input.amountPaid)), PAGE_W - M, 12, bold, ACC);
    y -= 18;
  }
  y -= 12;

  // ---- Notes
  if (input.notes && input.notes.trim()) {
    const noteLines = wrap(input.notes.trim(), regular, 9.3, PAGE_W - 2 * M);
    ensure(20 + noteLines.length * 12);
    draw("NOTES", M, 8, bold, MUT);
    y -= 13;
    for (const l of noteLines) {
      ensure(12);
      draw(l, M, 9.3, regular, INK);
      y -= 12;
    }
  }

  // ---- Footer on every page
  const foot = input.footer?.trim() || `Thank you for your business - ${input.from.name}`;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 46 }, end: { x: PAGE_W - M, y: 46 }, thickness: 0.5, color: RULE });
    const t = pdfSafe(foot).slice(0, 110);
    p.drawText(t, { x: (PAGE_W - regular.widthOfTextAtSize(t, 9)) / 2, y: 30, size: 9, font: regular, color: MUT });
    if (pages.length > 1) {
      const n = `Page ${i + 1} of ${pages.length}`;
      p.drawText(n, { x: PAGE_W - M - regular.widthOfTextAtSize(n, 8), y: 16, size: 8, font: regular, color: MUT });
    }
  });

  return doc.save();
}
