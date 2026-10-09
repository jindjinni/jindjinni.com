// The email that carries a purchase order: the order itself written out in the body (gray section bars, ship-to and bill-to side by
// side, the items table, the total and the terms), so the supplier can read it without opening anything, and the PDF attached.
// Pure: give it the order, get a subject, an HTML body and a plain-text body. Every typed value is escaped.

import { money, usDate } from "@/lib/purchase-order-rules";

export type PoEmailInput = {
  number: string;
  issueDate: string;
  from: { name: string; address: string | null; phone: string | null; email: string | null };
  supplier: { name: string };
  shipTo: { name: string | null; address: string | null };
  billTo: { name: string | null; address: string | null };
  reference: string | null;
  comments: string | null;
  terms: string | null;
  lines: { partNumber: string | null; ndc: string | null; name: string; size: string | null; quantity: number; unit: string; unitCost: number; total: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  /** A short note the sender typed above the order (optional). */
  message?: string | null;
  /** From the company's template (all optional): the word in the heading bar, opening wording, closing wording, the standing notice. */
  title?: string | null;
  intro?: string | null;
  footer?: string | null;
  notice?: string | null;
  revision?: number | null;
  revisionNote?: string | null;
};

export const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const br = (s: string | null | undefined) => esc(s).replace(/\r/g, "").replace(/\n/g, "<br>");

export const poEmailSubject = (number: string, fromName: string, revision?: number | null) =>
  revision && revision > 0 ? `REVISED Purchase Order ${number} Rev ${Math.floor(revision)} from ${fromName}` : `Purchase Order ${number} from ${fromName}`;

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const BAR = "background:#ececec;font-weight:bold;padding:6px 8px;";
const CELL = "padding:5px 8px;vertical-align:top;";

export function buildPoEmail(i: PoEmailInput): { subject: string; html: string; text: string } {
  const subject = poEmailSubject(i.number, i.from.name, i.revision);
  const rev = i.revision && i.revision > 0 ? Math.floor(i.revision) : 0;
  const callout = (label: string, text: string, bg: string, line: string) =>
    `<div style="margin:0 0 14px;padding:10px 12px;background:${bg};border:1px solid ${line};"><div style="font-size:11px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;color:#6b4e00;">${esc(label)}</div><div style="margin-top:4px;">${br(text)}</div></div>`;
  const fromLine = [i.from.address?.replace(/\s*\n\s*/g, ", "), i.from.phone].filter(Boolean).join("  |  ");

  const rows = i.lines
    .map(
      (l) =>
        `<tr><td style="${CELL}white-space:nowrap;">${esc(l.partNumber)}</td><td style="${CELL}white-space:nowrap;">${esc(l.ndc)}</td><td style="${CELL}">${esc(l.name)}${l.size ? ` (${esc(l.size)})` : ""}</td>` +
        `<td style="${CELL}text-align:right;">${l.quantity}</td><td style="${CELL}text-align:center;">${esc(l.unit)}</td>` +
        `<td style="${CELL}text-align:right;">${money(l.unitCost)}</td><td style="${CELL}text-align:right;">${money(l.total)}</td></tr>`,
    )
    .join("");

  const who = (w: { name: string | null; address: string | null }) => `${w.name ? `<strong>${esc(w.name)}</strong><br>` : ""}${br(w.address)}`;

  const html =
    `<div style="${FONT}font-size:14px;line-height:1.45;color:#1a1d21;max-width:760px;">` +
    (i.message?.trim() ? `<p style="margin:0 0 16px;">${br(i.message.trim())}</p>` : "") +
    (rev && i.revisionNote?.trim() ? callout(`Revision ${rev} - what changed`, i.revisionNote.trim(), "#fdeeee", "#b91c1c") : "") +
    (i.notice?.trim() ? callout("Please note", i.notice.trim(), "#fff8dc", "#d9a521") : "") +
    (i.intro?.trim() ? `<p style="margin:0 0 14px;">${br(i.intro.trim())}</p>` : "") +
    `<div style="text-align:center;margin:0 0 12px;"><div style="font-size:26px;font-weight:bold;letter-spacing:.5px;">${esc(i.from.name)}</div></div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">` +
    `<tr><td colspan="2" style="${BAR}text-align:center;">${esc(i.title?.trim() ? i.title.trim() : "Purchase Order")}${rev ? ` - Revision ${rev}` : ""}</td></tr>` +
    `<tr><td style="${CELL}"><strong>ID:</strong> ${esc(i.number)}</td><td style="${CELL}"><strong>Date:</strong> ${esc(usDate(i.issueDate))}</td></tr>` +
    `<tr><td colspan="2" style="${CELL}"><strong>Vendor:</strong> ${esc(i.supplier.name)}</td></tr>` +
    `<tr><td style="${BAR}width:50%;">Shipping</td><td style="${BAR}width:50%;">Billing</td></tr>` +
    `<tr><td style="${CELL}">${who(i.shipTo)}</td><td style="${CELL}">${who(i.billTo)}</td></tr>` +
    `<tr><td style="${BAR}text-align:center;">Reference</td><td style="${BAR}text-align:center;">Comments</td></tr>` +
    `<tr><td style="${CELL}">${br(i.reference)}</td><td style="${CELL}">${br(i.comments)}</td></tr>` +
    `</table>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px;font-size:13px;">` +
    `<tr style="background:#ececec;font-weight:bold;"><td style="${CELL}">Part Number</td><td style="${CELL}">NDC</td><td style="${CELL}">Item Name</td><td style="${CELL}text-align:right;">Qty.</td><td style="${CELL}text-align:center;">Unit</td><td style="${CELL}text-align:right;">Cost (US$)</td><td style="${CELL}text-align:right;">Total (US$)</td></tr>` +
    rows +
    (i.shipping > 0 ? `<tr><td colspan="6" style="${CELL}text-align:right;">Shipping:</td><td style="${CELL}text-align:right;">${money(i.shipping)}</td></tr>` : "") +
    `<tr><td colspan="6" style="${CELL}text-align:right;font-weight:bold;">Total:</td><td style="${CELL}text-align:right;font-weight:bold;">${money(i.total)}</td></tr>` +
    `</table>` +
    (i.terms?.trim() ? `<p style="margin:18px 0 0;font-size:13px;">${br(i.terms.trim())}</p>` : "") +
    (i.footer?.trim() ? `<p style="margin:12px 0 0;font-size:12px;color:#4b5563;">${br(i.footer.trim())}</p>` : "") +
    `<p style="margin:22px 0 0;text-align:center;font-size:12px;color:#6b7280;">${esc(i.from.name)}${fromLine ? `<br>${esc(fromLine)}` : ""}${i.from.email ? `<br>${esc(i.from.email)}` : ""}</p>` +
    `<p style="margin:10px 0 0;text-align:center;font-size:12px;color:#6b7280;">The same order is attached as a PDF.</p>` +
    `</div>`;

  const line = (l: PoEmailInput["lines"][number]) =>
    `${[l.partNumber, l.ndc ? `NDC ${l.ndc}` : null].filter(Boolean).join("  ")}${l.partNumber || l.ndc ? "  " : ""}${l.name}${l.size ? ` (${l.size})` : ""}  x${l.quantity} ${l.unit} @ ${money(l.unitCost)} = ${money(l.total)}`;
  const text = [
    i.message?.trim() ?? "",
    rev && i.revisionNote?.trim() ? `REVISION ${rev} - WHAT CHANGED: ${i.revisionNote.trim()}` : "",
    i.notice?.trim() ? `PLEASE NOTE: ${i.notice.trim()}` : "",
    i.intro?.trim() ?? "",
    `${(i.title?.trim() ? i.title.trim() : "PURCHASE ORDER").toUpperCase()} ${i.number}${rev ? ` REV ${rev}` : ""}`,
    `From: ${i.from.name}`,
    `Vendor: ${i.supplier.name}`,
    `Date: ${usDate(i.issueDate)}`,
    "",
    `Ship to: ${[i.shipTo.name, i.shipTo.address].filter(Boolean).join(", ").replace(/\s*\n\s*/g, ", ")}`,
    `Bill to: ${[i.billTo.name, i.billTo.address].filter(Boolean).join(", ").replace(/\s*\n\s*/g, ", ")}`,
    i.reference ? `Reference: ${i.reference}` : "",
    i.comments ? `Comments: ${i.comments}` : "",
    "",
    ...i.lines.map(line),
    i.shipping > 0 ? `Shipping: ${money(i.shipping)}` : "",
    `Total: ${money(i.total)}`,
    "",
    i.terms?.trim() ?? "",
    i.footer?.trim() ?? "",
    "",
    "The same order is attached as a PDF.",
  ]
    .filter((s, idx, arr) => s !== "" || (idx > 0 && arr[idx - 1] !== ""))
    .join("\n");

  return { subject, html, text };
}
