// Audit Center rules (Accounts, Distribution operation only). Pure: no database, no clock unless passed in, easy to test.
//
// A pharmacy that bought from us can be audited in three ways, and each way may show a different set of columns:
//  - INTERNAL   the pharmacy asks for its own purchase history (prices and shipping included), sent to the pharmacy.
//  - PBM        a pharmacy-benefit manager's auditor asks for device purchases (NEVER prices or shipping, always the NCPDP).
//  - REGULATORY a state or federal body asks (prices and shipping included, the pharmacy is not copied). Built in phase 2.
//
// The one hard rule: a PBM file is built from an approved list of non-money columns. It is not "hidden columns": the money
// values are never copied into the workbook at all, and no setting can add them back (see `PBM_COLUMNS` and `assertPbmSafe`).

export const AUDIT_TYPES = ["INTERNAL", "PBM", "REGULATORY"] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];
/** The audit types the Audit Center can generate today. */
export const BUILT_TYPES: readonly AuditType[] = ["INTERNAL", "PBM"];

export const TYPE_LABEL: Record<AuditType, string> = {
  INTERNAL: "Pharmacy Internal Audit",
  PBM: "PBM Audit",
  REGULATORY: "State / Federal / Regulatory Audit",
};
export const TYPE_BLURB: Record<AuditType, string> = {
  INTERNAL: "A pharmacy asks for its own purchase records to check its books. Prices and shipping are included. Sent to the pharmacy.",
  PBM: "A pharmacy-benefit manager's auditor asks for device purchases. The file never contains prices or shipping. Sent to the auditor, with the pharmacy copied.",
  REGULATORY: "A state or federal body asks for device purchases. Prices and shipping are included. The pharmacy is not copied.",
};

/** Bump a template's version when its columns change; every generated file remembers the version it used. */
export const TEMPLATE_VERSION: Record<AuditType, string> = { INTERNAL: "Internal v1.0", PBM: "PBM v1.0", REGULATORY: "Regulatory v1.0" };

export const AUDIT_STATUSES = [
  "NEW_REQUEST",
  "REVIEWING_REQUEST",
  "DEVICE_CONFIRMATION_NEEDED",
  "WAITING_FOR_INFORMATION",
  "RECORDS_BEING_PREPARED",
  "REVIEW_REQUIRED",
  "READY_TO_GENERATE",
  "READY_TO_SEND",
  "SENT",
  "FOLLOW_UP_REQUIRED",
  "COMPLETE",
  "CANCELLED",
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
export const STATUS_LABEL: Record<AuditStatus, string> = {
  NEW_REQUEST: "New request",
  REVIEWING_REQUEST: "Reviewing request",
  DEVICE_CONFIRMATION_NEEDED: "Device confirmation needed",
  WAITING_FOR_INFORMATION: "Waiting for information",
  RECORDS_BEING_PREPARED: "Records being prepared",
  REVIEW_REQUIRED: "Review required",
  READY_TO_GENERATE: "Ready to generate",
  READY_TO_SEND: "Ready to send",
  SENT: "Sent",
  FOLLOW_UP_REQUIRED: "Follow-up required",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};
/** Statuses where the audit is finished or stopped: nothing can be changed until it is reopened. */
export const CLOSED_STATUSES: readonly AuditStatus[] = ["COMPLETE", "CANCELLED"];
export const isClosed = (s: string) => (CLOSED_STATUSES as readonly string[]).includes(s);
export const isAuditStatus = (v: unknown): v is AuditStatus => typeof v === "string" && (AUDIT_STATUSES as readonly string[]).includes(v);
export const isAuditType = (v: unknown): v is AuditType => typeof v === "string" && (AUDIT_TYPES as readonly string[]).includes(v);

export const DEVICE_ANSWERS = ["YES", "NO", "UNCLEAR"] as const;
export type DeviceAnswer = (typeof DEVICE_ANSWERS)[number];
export const isDeviceAnswer = (v: unknown): v is DeviceAnswer => typeof v === "string" && (DEVICE_ANSWERS as readonly string[]).includes(v);

/** Invoices that count as real sales: sent or paid. Drafts were never issued, and voided invoices were cancelled. */
export const COUNTED_INVOICE_STATUSES = ["SENT", "PARTIALLY_PAID", "PAID"] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------------------

export type ColumnKey =
  | "type"
  | "date"
  | "invoiceNumber"
  | "ndc"
  | "pharmacyName"
  | "ncpdp"
  | "productName"
  | "productDescription"
  | "quantity"
  | "unitPrice"
  | "lineTotal"
  | "shipping"
  | "discount";

export type ColumnDef = { key: ColumnKey; header: string; kind: "text" | "date" | "int" | "money" };

const C: Record<ColumnKey, ColumnDef> = {
  type: { key: "type", header: "Type", kind: "text" },
  date: { key: "date", header: "Date", kind: "date" },
  invoiceNumber: { key: "invoiceNumber", header: "Invoice Number", kind: "text" },
  ndc: { key: "ndc", header: "NDC / NRC", kind: "text" },
  pharmacyName: { key: "pharmacyName", header: "Pharmacy Name", kind: "text" },
  ncpdp: { key: "ncpdp", header: "NCPDP", kind: "text" },
  productName: { key: "productName", header: "Product Name / Item", kind: "text" },
  productDescription: { key: "productDescription", header: "Product Description / Box Count / Device Duration", kind: "text" },
  quantity: { key: "quantity", header: "Quantity Sold", kind: "int" },
  unitPrice: { key: "unitPrice", header: "Price Per Unit", kind: "money" },
  lineTotal: { key: "lineTotal", header: "Line Total", kind: "money" },
  shipping: { key: "shipping", header: "Shipping Cost", kind: "money" },
  discount: { key: "discount", header: "Discount", kind: "money" },
};

/** Every column that carries money. A PBM file may never contain any of these. */
export const MONEY_KEYS: readonly ColumnKey[] = ["unitPrice", "lineTotal", "shipping", "discount"];

/** The PBM file's columns, in order. This list is the whole definition: nothing else can be exported to a PBM. */
export const PBM_COLUMNS: readonly ColumnDef[] = Object.freeze([C.type, C.date, C.invoiceNumber, C.ndc, C.pharmacyName, C.productName, C.productDescription, C.quantity]);

/** Throws if a PBM column list contains anything that carries money. Called on every PBM build and in the tests. */
export function assertPbmSafe(columns: readonly ColumnDef[]): void {
  for (const c of columns) {
    if ((MONEY_KEYS as readonly string[]).includes(c.key) || c.kind === "money") throw new Error(`A PBM audit file can never contain "${c.header}".`);
  }
}

export type ReportOptions = {
  /** Internal and regulatory files: put the pharmacy's name (and NCPDP) in the sheet. Always on for PBM. */
  includePharmacy?: boolean;
};

/** The columns of a report. PBM ignores every option. */
export function columnsFor(type: AuditType, opts: ReportOptions = {}): ColumnDef[] {
  if (type === "PBM") {
    assertPbmSafe(PBM_COLUMNS);
    return [...PBM_COLUMNS];
  }
  const cols: ColumnDef[] = [C.invoiceNumber, C.date];
  if (opts.includePharmacy) cols.push(C.pharmacyName, C.ncpdp);
  cols.push(C.ndc, C.productName, C.productDescription, C.quantity, C.unitPrice, C.lineTotal, C.shipping, C.discount);
  return cols;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------------

/** One invoice line as it comes out of Sales (the audit never changes it). */
export type SourceLine = {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  /** The invoice date, "YYYY-MM-DD". */
  date: string | null;
  position: number;
  productId: string | null;
  productKey: string | null;
  productName: string;
  ndc: string | null;
  /** From the product list (for example "10-Day", "50ct"), or null when the product has none. */
  packageDescription: string | null;
  quantity: number;
  unitPrice: number;
  /** The whole invoice's shipping and discount (shown once, on the invoice's first line). */
  invoiceShipping: number;
  invoiceDiscount: number;
};

export type PharmacyInfo = { name: string; ncpdp: string | null };

export type ReportRow = Partial<Record<ColumnKey, string | number | null>>;

const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const text = (s: string | null | undefined) => (s ?? "").toString().trim();

/** One invoice line must never be counted twice, however it was reached. */
export function dedupeLines(lines: SourceLine[]): SourceLine[] {
  const seen = new Set<string>();
  const out: SourceLine[] = [];
  for (const l of lines) {
    if (seen.has(l.lineId)) continue;
    seen.add(l.lineId);
    out.push(l);
  }
  return out;
}

/** Date first, then invoice number (as a number when it is one), then the line's place on the invoice. */
export function sortLines(lines: SourceLine[]): SourceLine[] {
  const num = (s: string | null) => {
    const m = /\d+/.exec(s ?? "");
    return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
  };
  return [...lines].sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") ||
      num(a.invoiceNumber) - num(b.invoiceNumber) ||
      text(a.invoiceNumber).localeCompare(text(b.invoiceNumber)) ||
      a.position - b.position,
  );
}

/** The text on the Product Description column: the product's package detail, else nothing. */
export const descriptionOf = (l: SourceLine) => text(l.packageDescription);

/**
 * Builds the rows of a report from invoice lines. Each row is made ONLY from the columns of the template, so for a PBM file the
 * price, shipping and discount are not copied anywhere: they do not exist in the result, hidden or otherwise.
 */
export function buildRows(type: AuditType, lines: SourceLine[], pharmacy: PharmacyInfo, opts: ReportOptions = {}): { columns: ColumnDef[]; rows: ReportRow[] } {
  const columns = columnsFor(type, opts);
  const allowed = new Set<string>(columns.map((c) => c.key));
  const sorted = sortLines(dedupeLines(lines));
  const firstOfInvoice = new Set<string>();
  const rows: ReportRow[] = [];
  for (const l of sorted) {
    const isFirst = !firstOfInvoice.has(l.invoiceId);
    firstOfInvoice.add(l.invoiceId);
    // Everything we could know about this line; only the template's columns are kept (below).
    const all: ReportRow = {
      type: "Invoice",
      date: l.date,
      invoiceNumber: text(l.invoiceNumber) || null,
      ndc: text(l.ndc) || null,
      pharmacyName: pharmacy.name,
      ncpdp: pharmacy.ncpdp,
      productName: text(l.productName),
      productDescription: descriptionOf(l) || null,
      quantity: l.quantity,
      unitPrice: allowed.has("unitPrice") ? cents(l.unitPrice) : undefined,
      lineTotal: allowed.has("lineTotal") ? cents(l.unitPrice * l.quantity) : undefined,
      shipping: allowed.has("shipping") && isFirst && l.invoiceShipping ? cents(l.invoiceShipping) : null,
      discount: allowed.has("discount") && isFirst && l.invoiceDiscount ? cents(l.invoiceDiscount) : null,
    };
    const row: ReportRow = {};
    for (const c of columns) row[c.key] = all[c.key] ?? null;
    rows.push(row);
  }
  if (type === "PBM") for (const r of rows) for (const k of MONEY_KEYS) if (k in r) throw new Error("A PBM row picked up a money column.");
  return { columns, rows };
}

/** Columns with no value on any row are left out of the file ("do not export blank columns"). */
export function dropBlankColumns(columns: ColumnDef[], rows: ReportRow[], keep: readonly ColumnKey[] = ["invoiceNumber", "date", "quantity"]): ColumnDef[] {
  return columns.filter((c) => keep.includes(c.key) || rows.some((r) => r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== ""));
}

// ---------------------------------------------------------------------------------------------------------------------
// Checks before generating
// ---------------------------------------------------------------------------------------------------------------------

export type AuditInput = {
  type: AuditType;
  pharmacyName: string | null;
  ncpdp: string | null;
  startDate: string | null;
  endDate: string | null;
  deviceAnswer: DeviceAnswer | null;
  auditorName?: string | null;
  auditorEmail?: string | null;
  pbmName?: string | null;
};

const isDay = (s: string | null | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
export { isDay };

/** Things that stop the audit from being generated (the screen lists them and keeps the button off). */
export function blockers(a: AuditInput): string[] {
  const out: string[] = [];
  if (!text(a.pharmacyName)) out.push("Choose the pharmacy.");
  if (!isDay(a.startDate) || !isDay(a.endDate)) out.push("Enter the start date and the end date the auditor asked for.");
  else if ((a.startDate as string) > (a.endDate as string)) out.push("The start date is after the end date.");
  if (a.type !== "INTERNAL") {
    if (a.deviceAnswer === "UNCLEAR" || !a.deviceAnswer) out.push("Confirm with the auditor that medical-device purchase records are what they want. Until then, nothing can be generated.");
    else if (a.deviceAnswer === "NO") out.push("The auditor is not asking for device records, so there is nothing to generate from our device sales. Note that on the case and close it.");
  }
  if (a.type === "PBM") {
    if (!text(a.ncpdp)) out.push("This pharmacy has no NCPDP number on file. Add it to the pharmacy in Sales → Buyers.");
    if (!text(a.auditorName) && !text(a.auditorEmail)) out.push("Enter who the auditor is (name or email).");
  }
  return out;
}

export type LineWarning = { code: "MISSING_NDC" | "MISSING_DESCRIPTION" | "MISSING_INVOICE_NUMBER" | "MISSING_QUANTITY" | "MISSING_DATE"; label: string; lineId: string; invoiceNumber: string | null; productName: string };
const WARN_LABEL: Record<LineWarning["code"], string> = {
  MISSING_NDC: "Missing NDC/NRC",
  MISSING_DESCRIPTION: "Missing product description (package or duration)",
  MISSING_INVOICE_NUMBER: "Missing invoice number",
  MISSING_QUANTITY: "Missing quantity",
  MISSING_DATE: "Missing transaction date",
};

/** Data-quality flags. Nothing is silently left out: these lines stay in the file and are listed so the missing detail can be fixed first. */
export function lineWarnings(lines: SourceLine[]): LineWarning[] {
  const out: LineWarning[] = [];
  for (const l of dedupeLines(lines)) {
    const add = (code: LineWarning["code"]) => out.push({ code, label: WARN_LABEL[code], lineId: l.lineId, invoiceNumber: l.invoiceNumber, productName: l.productName });
    if (!text(l.ndc)) add("MISSING_NDC");
    if (!descriptionOf(l)) add("MISSING_DESCRIPTION");
    if (!text(l.invoiceNumber)) add("MISSING_INVOICE_NUMBER");
    if (!l.quantity || l.quantity <= 0) add("MISSING_QUANTITY");
    if (!isDay(l.date)) add("MISSING_DATE");
  }
  return out;
}

/** The counts shown in the preview. */
export function summarize(rows: ReportRow[]) {
  const invoices = new Set(rows.map((r) => r.invoiceNumber ?? "")).size;
  const products = new Set(rows.map((r) => `${r.ndc ?? ""}|${r.productName ?? ""}`)).size;
  const units = rows.reduce((n, r) => n + (typeof r.quantity === "number" ? r.quantity : 0), 0);
  return { rows: rows.length, invoices, products, units };
}

/** What the screen says the safeguards are, for the preview and the send check. */
export function safeguards(type: AuditType): { pricing: "included" | "excluded"; shipping: "included" | "excluded"; locked: boolean } {
  return type === "PBM" ? { pricing: "excluded", shipping: "excluded", locked: true } : { pricing: "included", shipping: "included", locked: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------------------------------

/** Where a case that is still being worked on should sit, from what is known about it. Sent, complete and cancelled are set by hand. */
export function workingStatus(a: { type: AuditType; deviceAnswer: DeviceAnswer | null; hasFile: boolean; blockers: number }): AuditStatus {
  if (a.type !== "INTERNAL" && (a.deviceAnswer === "UNCLEAR" || !a.deviceAnswer)) return "DEVICE_CONFIRMATION_NEEDED";
  if (a.hasFile) return "READY_TO_SEND";
  return a.blockers > 0 ? "WAITING_FOR_INFORMATION" : "READY_TO_GENERATE";
}

// ---------------------------------------------------------------------------------------------------------------------
// Names, numbers and dates
// ---------------------------------------------------------------------------------------------------------------------

/** AUD-2026-00001. */
export const caseNumber = (year: number, seq: number) => `AUD-${year}-${String(seq).padStart(5, "0")}`;

/** Keeps letters, digits, dashes and underscores; spaces become underscores. Never returns an empty string. */
export function safePart(s: string | null | undefined): string {
  const t = text(s).replace(/[^A-Za-z0-9 _-]+/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return t.slice(0, 60) || "Pharmacy";
}

/** PharmacyName_NCPDP_PBMAudit_2026-01-01_to_2026-06-30.xlsx (and the internal and regulatory forms). */
export function fileNameFor(type: AuditType, pharmacyName: string, ncpdp: string | null, start: string, end: string, version = 1): string {
  const kind = type === "PBM" ? "PBMAudit" : type === "REGULATORY" ? "RegulatoryAudit" : "InternalAudit";
  const parts = [safePart(pharmacyName)];
  if (type === "PBM" && text(ncpdp)) parts.push(safePart(ncpdp));
  parts.push(kind, `${start}_to_${end}`);
  return `${parts.join("_")}${version > 1 ? `_v${version}` : ""}.xlsx`;
}

export const DATE_PRESETS = ["current-month", "previous-month", "current-quarter", "previous-quarter", "current-year", "previous-year"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const PRESET_LABEL: Record<DatePreset, string> = {
  "current-month": "Current month",
  "previous-month": "Previous month",
  "current-quarter": "Current quarter",
  "previous-quarter": "Previous quarter",
  "current-year": "Current year",
  "previous-year": "Previous year",
};
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
/** The first and last day of a preset range, counted from `today` ("YYYY-MM-DD"). */
export function presetRange(p: DatePreset, today: string): { start: string; end: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const span = (y1: number, m1: number, y2: number, m2: number) => ({ start: `${y1}-${pad(m1)}-01`, end: `${y2}-${pad(m2)}-${pad(lastDay(y2, m2))}` });
  if (p === "current-month") return span(y, m, y, m);
  if (p === "previous-month") return m === 1 ? span(y - 1, 12, y - 1, 12) : span(y, m - 1, y, m - 1);
  const q0 = Math.floor((m - 1) / 3) * 3 + 1; // first month of this quarter
  if (p === "current-quarter") return span(y, q0, y, q0 + 2);
  if (p === "previous-quarter") return q0 === 1 ? span(y - 1, 10, y - 1, 12) : span(y, q0 - 3, y, q0 - 1);
  if (p === "current-year") return span(y, 1, y, 12);
  return span(y - 1, 1, y - 1, 12);
}

/** The PBM email subject: "Example Pharmacy LLC Audit – NCPDP #5746826". */
export const pbmSubject = (pharmacyName: string, ncpdp: string) => `${text(pharmacyName)} Audit – NCPDP #${text(ncpdp)}`;

/** Splits a sheet value like "NDC 12345-6789-01" apart is NOT done: NDC/NRC is kept exactly as typed. Only whitespace is trimmed. */
export const cleanNdc = (s: string | null | undefined) => text(s);

/** "YYYY-MM-DD" -> "01/31/2026" for people. */
export function usDate(d: string | null | undefined): string {
  if (!d || !isDay(d)) return d ?? "";
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
}

/** Management-only actions (reopen a closed case, cancel it). */
export const AUDIT_EVENT_KINDS = ["CREATED", "CHANGED", "DEVICE_ANSWER", "GENERATED", "DOWNLOADED", "SENT", "NOTE", "STATUS", "REOPENED", "FILE_ADDED"] as const;
export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];
