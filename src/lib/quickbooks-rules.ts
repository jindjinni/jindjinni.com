// QuickBooks, the pure part: the notice a company accepts before connecting, which reports exist and who may see them, and turning
// QuickBooks' answers (or an uploaded export file) into one plain table. No database, no network, so it is fully testable.
//
// What the platform does with QuickBooks is READ. Nothing in this app writes to a company's QuickBooks (see lib/quickbooks.ts).

export type ReportKind = "PAID" | "OWED" | "PNL";
export const REPORT_KINDS: ReportKind[] = ["PAID", "OWED", "PNL"];

export type ReportTable = {
  columns: string[];
  rows: string[][];
  /** Row numbers shown in bold (section titles and totals). */
  bold: number[];
};

export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 40;
export const MAX_CELL = 200;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** After a pull, the same report can't be pulled again for this long (QuickBooks limits how often an app may ask). */
export const REFRESH_COOLDOWN_SEC = 60;
/** How many saved copies of one report are kept for a company. */
export const KEEP_COPIES = 30;
/** How many rows a page draws. The CSV download has them all. */
export const SHOW_ROWS = 200;

export const REPORT_META: Record<ReportKind, { label: string; blurb: string; qboTitle: string; fileHint: string }> = {
  PAID: {
    label: "Who has paid",
    blurb: "Payments QuickBooks has recorded from your customers in the last 90 days: the date, the customer and the amount.",
    qboTitle: "Payments received, last 90 days",
    fileHint: "In QuickBooks Desktop or Enterprise open Reports, then Customers & Receivables, then Transaction List by Customer (or Customer Balance Detail), set the dates, and export it as a CSV file.",
  },
  OWED: {
    label: "Who owes",
    blurb: "What each customer still owes in QuickBooks, split by how late it is (the A/R aging summary).",
    qboTitle: "Customers who owe (A/R aging summary)",
    fileHint: "In QuickBooks Desktop or Enterprise open Reports, then Customers & Receivables, then A/R Aging Summary, and export it as a CSV file.",
  },
  PNL: {
    label: "Profit and loss",
    blurb: "Money in, money out and what is left, for the last 90 days (QuickBooks' profit and loss report).",
    qboTitle: "Profit and loss, last 90 days",
    fileHint: "In QuickBooks Desktop or Enterprise open Reports, then Company & Financial, then Profit & Loss Standard, set the dates, and export it as a CSV file.",
  },
};

export const isReportKind = (v: unknown): v is ReportKind => v === "PAID" || v === "OWED" || v === "PNL";

/** Which reports a department shows. Sales sees who paid and who owes; profit and loss is Accounts only. */
export function kindsFor(dept: "sales" | "accounts"): ReportKind[] {
  return dept === "accounts" ? ["PAID", "OWED", "PNL"] : ["PAID", "OWED"];
}

// ---------------------------------------------------------------------------
// The notice. Shown before anyone connects; the version is saved with the connection.
// ---------------------------------------------------------------------------

export const TERMS_VERSION = "2026-10-1";

export const NOTICE_HEADING = "Please read before you connect QuickBooks";

export const NOTICE_POINTS: string[] = [
  "Connecting is your choice, and it is only a convenience. It lets the platform copy reports out of your QuickBooks so Sales and Accounts can see them here.",
  "The platform only reads. It never adds, changes or deletes anything in your QuickBooks. QuickBooks' own permission screen will say \"read and write\" because QuickBooks does not offer a read-only permission to apps; the platform is built so it can only ask QuickBooks questions.",
  "We never see or keep your QuickBooks password. We keep one secure key, locked with encryption, that lets us ask for reports for this company only. Disconnect any time here (we also tell QuickBooks to forget the key), or in QuickBooks under your connected apps.",
  "Only an owner or admin can connect. Anyone you give Sales or Accounts access to can see the saved reports, so connect only if you are comfortable with that.",
  "The reports are copies as of the time they were pulled. QuickBooks stays your official record. Check anything important in QuickBooks before you rely on it.",
  "The platform is not an accountant, bookkeeper or tax adviser. We do not take responsibility for decisions, filings, payments or losses that come from using these copies, for any mistakes or delays in what QuickBooks or Intuit sends, or for QuickBooks being unavailable or changing how it works.",
];

export const ACK_LABEL = "I have read this and I want to connect my QuickBooks.";

/** Pure: is the acknowledgement the person sent the version we are showing today? */
export const ackOk = (v: string | null | undefined) => v === TERMS_VERSION;

// ---------------------------------------------------------------------------
// Turning answers into tables
// ---------------------------------------------------------------------------

const clip = (v: unknown): string => {
  const s = v == null ? "" : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL - 1) + "…" : s;
};

type QboCol = { value?: string };
type QboRow = { type?: string; group?: string; Header?: { ColData?: QboCol[] }; ColData?: QboCol[]; Summary?: { ColData?: QboCol[] }; Rows?: { Row?: QboRow[] } };
export type QboReport = { Columns?: { Column?: { ColTitle?: string }[] }; Rows?: { Row?: QboRow[] } };

/** A QuickBooks report answer as a flat table. Sections become a bold title row, their rows are indented, totals are bold. */
export function fromQboReport(json: QboReport, firstColumn = "Name"): ReportTable {
  const titles = (json.Columns?.Column ?? []).map((c, i) => clip(c.ColTitle) || (i === 0 ? firstColumn : ""));
  const columns = (titles.length ? titles : [firstColumn]).slice(0, MAX_COLUMNS);
  const rows: string[][] = [];
  const bold: number[] = [];
  const cells = (cd: QboCol[] | undefined, depth: number): string[] => {
    const out = columns.map((_, i) => clip(cd?.[i]?.value));
    if (depth > 0 && out[0]) out[0] = "  ".repeat(depth) + out[0];
    return out;
  };
  const walk = (list: QboRow[] | undefined, depth: number) => {
    for (const r of list ?? []) {
      if (rows.length >= MAX_ROWS) return;
      if (r.Header?.ColData) {
        const h = cells(r.Header.ColData, depth);
        if (h.some((x) => x)) {
          rows.push(h);
          bold.push(rows.length - 1);
        }
      }
      if (r.ColData) rows.push(cells(r.ColData, depth));
      if (r.Rows?.Row) walk(r.Rows.Row, depth + (r.Header?.ColData ? 1 : 0));
      if (r.Summary?.ColData) {
        rows.push(cells(r.Summary.ColData, depth));
        bold.push(rows.length - 1);
      }
    }
  };
  walk(json.Rows?.Row, 0);
  return { columns, rows, bold };
}

type QboPayment = { TxnDate?: string; CustomerRef?: { name?: string }; TotalAmt?: number; PaymentRefNum?: string; UnappliedAmt?: number };

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** QuickBooks' payments, newest first, with a total row. */
export function fromQboPayments(payments: QboPayment[]): ReportTable {
  const sorted = [...payments].sort((a, b) => String(b.TxnDate ?? "").localeCompare(String(a.TxnDate ?? "")));
  const rows = sorted.slice(0, MAX_ROWS).map((p) => [clip(p.TxnDate), clip(p.CustomerRef?.name), money(Number(p.TotalAmt) || 0), clip(p.PaymentRefNum), Number(p.UnappliedAmt) > 0 ? money(Number(p.UnappliedAmt)) : ""]);
  const total = sorted.reduce((a, p) => a + (Number(p.TotalAmt) || 0), 0);
  const bold: number[] = [];
  if (rows.length) {
    rows.push(["Total", `${sorted.length} payment${sorted.length === 1 ? "" : "s"}`, money(total), "", ""]);
    bold.push(rows.length - 1);
  }
  return { columns: ["Date", "Customer", "Amount", "Reference", "Not yet applied"], rows, bold };
}

export type GridResult = { ok: true; table: ReportTable } | { ok: false; error: string };

/**
 * An uploaded QuickBooks Desktop / Enterprise export as a table. QuickBooks puts a title (and sometimes blank first columns) above the
 * real headings, so the heading row is the first row with at least two filled cells. Rows that are completely empty are dropped.
 */
export function tableFromGrid(grid: string[][]): GridResult {
  const start = grid.findIndex((r) => r.filter((c) => c.trim() !== "").length >= 2);
  if (start < 0) return { ok: false, error: "That file doesn't look like a QuickBooks report. Export the report as a CSV file and try again." };
  let width = 0;
  for (const r of grid.slice(start)) {
    let last = -1;
    r.forEach((c, i) => {
      if (c.trim() !== "") last = i;
    });
    width = Math.max(width, last + 1);
  }
  // Drop leading columns that are empty all the way down.
  let skip = 0;
  while (skip < width && grid.slice(start).every((r) => !(r[skip] ?? "").trim())) skip++;
  const take = (r: string[]) => Array.from({ length: Math.min(width - skip, MAX_COLUMNS) }, (_, i) => clip(r[skip + i]));
  const head = take(grid[start]).map((h, i) => h || (i === 0 ? "Name" : ""));
  const body = grid.slice(start + 1).map(take).filter((r) => r.some((c) => c));
  if (body.length === 0) return { ok: false, error: "That file has headings but no rows. Check the dates on the report and export it again." };
  if (body.length > MAX_ROWS) return { ok: false, error: `That file has more than ${MAX_ROWS.toLocaleString("en-US")} rows. Choose a shorter period and export it again.` };
  const bold = body.map((r, i) => (/^(total|net income|gross profit|net ordinary income)/i.test(r[0] ?? "") ? i : -1)).filter((i) => i >= 0);
  return { ok: true, table: { columns: head, rows: body, bold } };
}

/** Is this text a money amount ("1,234.50", "-$20.00", "(20.00)")? Used to right-align numbers. */
export const looksLikeMoney = (s: string) => /^[-(]?\$?\s?[\d,]+(\.\d+)?\)?$/.test(s.trim()) && /\d/.test(s);

/** A CSV file for one table. A cell that starts like a formula is kept as plain text so a spreadsheet won't run it. */
export function csvOf(t: { columns: string[]; rows: string[][] }): string {
  const cell = (v: string) => {
    let s = v ?? "";
    if (/^[=+\-@\t\r]/.test(s) && !looksLikeMoney(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Seconds a person must wait before pulling the same report again (0 = go ahead). `takenAt` is an ISO or SQL UTC time. */
export function refreshWait(takenAt: string | null | undefined, now = Date.now()): number {
  if (!takenAt) return 0;
  const t = Date.parse(takenAt.includes("T") ? takenAt : takenAt.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil(REFRESH_COOLDOWN_SEC - (now - t) / 1000));
}

/** The first and last day of the last `days` days ending today (YYYY-MM-DD). */
export function lastDays(today: string, days: number): { start: string; end: string } {
  const end = new Date(today + "T00:00:00Z");
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: start.toISOString().slice(0, 10), end: today };
}

/** Is the file name one we accept? Only CSV: spreadsheet files can carry formulas and macros. */
export const fileOk = (name: string) => /\.(csv|txt)$/i.test(name.trim());
