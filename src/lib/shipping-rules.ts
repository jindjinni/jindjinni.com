// Shipping, the pure part (no database, no network): which orders can ship, cleaning a tracking number, the one status a shipment
// shows from its boxes, which group a shipment sits under, and the exact "your order has shipped" email. Safe to import from the browser.
//
// The email lists the items and their NDCs but never a price, shipping charge or total. An order PDF can be attached on purpose
// (it does show prices, which is fine for the buyer who placed the order), and nothing here ever copies anyone else.

import { carrierTrackingLink, isTrackingStatus, rollUp, type TrackingStatus } from "@/lib/tracking-rules";

export const CARRIERS = ["UPS", "USPS", "FedEx", "Other"] as const;
export type Carrier = (typeof CARRIERS)[number];
export const isCarrier = (v: unknown): v is Carrier => typeof v === "string" && (CARRIERS as readonly string[]).includes(v);

export const NOT_SHIPPED = "Not shipped" as const;
export type ShipmentStatus = TrackingStatus | typeof NOT_SHIPPED;

export const MAX_BOXES = 60;
export const MAX_FILES = 25;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** The most the email may carry (department mail allows 8 files / 8 MB). */
export const MAX_EMAIL_FILES = 8;
export const MAX_EMAIL_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Which orders ship
// ---------------------------------------------------------------------------

/** Sales orders that are out to the buyer (sent, confirmed, or already turned into an invoice) and invoices that went out can ship. */
export function canShipFrom(kind: string, status: string): boolean {
  if (kind === "SALES_ORDER") return status === "SENT" || status === "ACCEPTED" || status === "CONVERTED";
  if (kind === "INVOICE") return status === "SENT" || status === "PARTIALLY_PAID" || status === "PAID";
  return false;
}

export const docWordFor = (kind: string) =>
  kind === "SALES_ORDER" ? "Sales order" : kind === "INVOICE" ? "Invoice" : kind === "PURCHASE_ORDER" ? "Purchase order" : kind === "RETURN" ? "Return" : kind === "OTHER" ? "Shipment" : "Quotation";

/** An order or invoice (a shipment of a sale) as opposed to a return or other shipment. */
export const isOrderKind = (kind: string) => kind === "SALES_ORDER" || kind === "INVOICE";

/** "Sales order SO-12", or just "Return" when it has no number. */
export const docLabel = (kind: string, number: string) => (number ? `${docWordFor(kind)} ${number}` : docWordFor(kind));

// ---------------------------------------------------------------------------
// Tracking numbers
// ---------------------------------------------------------------------------

/** Spaces, dashes and lower case are cleaned away: "1z 999 aa1 0123456784" -> "1Z999AA10123456784". */
export function cleanTracking(raw: string): string {
  return String(raw ?? "").replace(/[\s\-.]/g, "").toUpperCase();
}

export type TrackingCheck = { ok: true; number: string } | { ok: false; error: string };

export function checkTracking(raw: string): TrackingCheck {
  const n = cleanTracking(raw);
  if (!n) return { ok: false, error: "Type the tracking number." };
  if (!/^[A-Z0-9]+$/.test(n)) return { ok: false, error: "A tracking number has only letters and numbers." };
  if (n.length < 8 || n.length > 40) return { ok: false, error: "That doesn't look like a tracking number (it should be 8 to 40 letters and numbers)." };
  return { ok: true, number: n };
}

/** A best guess at the carrier from the number's shape (UPS 1Z..., USPS 9400..., FedEx 12 or 15 digits). Only used to pre-select the box; the person can change it. */
export function guessCarrier(number: string): Carrier | null {
  const n = cleanTracking(number);
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "UPS";
  if (/^(9[2-5]\d{18,20}|[A-Z]{2}\d{9}US)$/.test(n)) return "USPS";
  if (/^(\d{12}|\d{15}|\d{20})$/.test(n)) return "FedEx";
  return null;
}

// ---------------------------------------------------------------------------
// Status and grouping
// ---------------------------------------------------------------------------

export type BoxStatusInput = { status: string; deliveredAt: string | null; statusAt: string | null };

/** The one status for a shipment from its boxes ("Not shipped" while it has none). */
export function shipmentStatus(boxes: BoxStatusInput[]): { status: ShipmentStatus; deliveredAt: string | null; lastUpdate: string | null; delivered: number; total: number } {
  const r = rollUp(boxes);
  if (!r) return { status: NOT_SHIPPED, deliveredAt: null, lastUpdate: null, delivered: 0, total: 0 };
  return r;
}

export const STAGES = ["Problem", "Preparing", "Ready to send", "On the way", "Delivered"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_HELP: Record<Stage, string> = {
  Problem: "The carrier reports a problem or a return.",
  Preparing: "No boxes yet.",
  "Ready to send": "Boxes are in; the shipped email hasn't gone to the buyer.",
  "On the way": "Emailed, and still moving.",
  Delivered: "Every box has been delivered.",
};

/** Which heading a shipment sits under on the Shipments page. */
export function stageOf(s: { status: string; boxCount: number; emailStatus: string | null }): Stage {
  if (s.status === "Exception" || s.status === "Returned") return "Problem";
  if (s.boxCount === 0) return "Preparing";
  if (s.status === "Delivered") return "Delivered";
  if (s.emailStatus !== "SENT" && s.emailStatus !== "SKIPPED") return "Ready to send";
  return "On the way";
}

/** Statuses a person may set by hand on a box. */
export const MANUAL_STATUSES: readonly string[] = ["Pre-Transit", "In Transit", "Out for Delivery", "Delivered", "Exception", "Returned"];

export const statusLabel = (s: string) => (s === NOT_SHIPPED ? NOT_SHIPPED : isTrackingStatus(s) ? s : "Unknown");

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

export type EmailBox = { carrier: string; trackingNumber: string };
export type EmailItem = { name: string; quantity: number; ndc?: string | null };

export type ShippedEmailInput = {
  company: string;
  contact: string | null;
  docKind: string;
  docNumber: string;
  reference: string | null;
  shipDate: string;
  boxes: EmailBox[];
  items: EmailItem[];
  attachmentNames: string[];
  note: string;
  senderName: string;
  /** Why a return or other shipment is going out. */
  reason?: string | null;
};

const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** The exact subject and text of the shipped email. Nothing in it is a price. */
export function shippedEmail(i: ShippedEmailInput): { subject: string; text: string } {
  const order = isOrderKind(i.docKind);
  const orderRef = i.reference ? `PO ${i.reference}` : docLabel(i.docKind, i.docNumber);
  const subject = (order ? `Your order has shipped - ${orderRef} - ${i.company}` : `A shipment is on its way - ${i.reason?.trim() ? i.reason.trim().slice(0, 60) : orderRef} - ${i.company}`).slice(0, 200);
  const hello = i.contact?.trim() ? `Hello ${i.contact.trim()},` : "Hello,";
  const lines: string[] = [hello, "", order ? "Good day. Your order has shipped." : "Good day. A shipment is on its way to you.", ""];
  if (order) lines.push(`Order: ${docLabel(i.docKind, i.docNumber)}${i.reference ? ` (your PO ${i.reference})` : ""}`);
  else lines.push(`About: ${docWordFor(i.docKind)}${i.docNumber ? ` ${i.docNumber}` : ""}${i.reason?.trim() ? ` - ${i.reason.trim().slice(0, 200)}` : ""}`);
  lines.push(`Shipped: ${i.shipDate}`);
  lines.push("");
  lines.push(i.boxes.length === 1 ? "Tracking number:" : `Tracking numbers (${i.boxes.length} boxes):`);
  i.boxes.forEach((b, idx) => {
    const link = carrierTrackingLink(b.carrier, b.trackingNumber);
    lines.push(`  ${i.boxes.length > 1 ? `Box ${idx + 1} - ` : ""}${b.carrier === "Other" ? "" : b.carrier + " "}${b.trackingNumber}${link ? `\n    ${link}` : ""}`);
  });
  if (i.items.length) {
    lines.push("", "In this shipment:");
    for (const it of i.items) lines.push(`  ${qty(it.quantity)} x ${it.name}${it.ndc ? ` (NDC ${it.ndc})` : ""}`);
  }
  if (i.attachmentNames.length) lines.push("", `Attached: ${i.attachmentNames.join(", ")}`);
  const note = i.note.trim().slice(0, 1000);
  if (note) lines.push("", note);
  lines.push("", "Thank you for your business.", i.senderName);
  return { subject, text: lines.join("\n") };
}

export type Readiness = { ready: boolean; blockers: string[] };

/** Can the shipped email be sent now? */
export function emailReadiness(i: { to: string; boxCount: number; emailStatus: string | null }): Readiness {
  const blockers: string[] = [];
  if (i.emailStatus === "SENT" || i.emailStatus === "SKIPPED") blockers.push("This shipment was already handled.");
  if (i.emailStatus === "SENDING") blockers.push("This email is being sent right now.");
  if (i.boxCount === 0) blockers.push("Add at least one box with its tracking number.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.to.trim())) blockers.push("Add the buyer's email address.");
  return { ready: blockers.length === 0, blockers };
}

/** The files that go in the email, within the mail limits. Anything over a limit is left out and listed. */
export function pickAttachments(files: { id: string; filename: string; sizeBytes: number; attach: boolean }[], extraBytes = 0): { use: string[]; left: string[] } {
  const use: string[] = [];
  const left: string[] = [];
  let bytes = extraBytes;
  for (const f of files) {
    if (!f.attach) continue;
    if (use.length >= MAX_EMAIL_FILES || bytes + f.sizeBytes > MAX_EMAIL_BYTES) {
      left.push(f.filename);
      continue;
    }
    use.push(f.id);
    bytes += f.sizeBytes;
  }
  return { use, left };
}
