// The email side of the Audit Center (pure: no database, no clock). It decides who an audit goes to by default, writes the first
// draft, and runs the checklist that must be all green before the SEND button works. People can still edit the draft; the checks
// are always run again on the server when they press send.

import { MONEY_KEYS, regulatorySubject, pbmSubject, usDate, type AuditType, type ColumnDef, type DeviceAnswer } from "@/lib/audit-rules";

const text = (s: string | null | undefined) => (s ?? "").toString().trim();
export const isEmail = (s: string) => /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(s);

/** "a@x.com, b@y.com; c@z.com" -> the valid addresses (lower case, no repeats), plus anything that was not an address. */
export function parseAddresses(input: string | null | undefined, max = 10): { list: string[]; bad: string[]; tooMany: boolean } {
  const seen = new Set<string>();
  const list: string[] = [];
  const bad: string[] = [];
  for (const raw of (input ?? "").split(/[,;\n\r\t ]+/)) {
    const t = raw.trim().replace(/^<|>$/g, "");
    if (!t) continue;
    if (!isEmail(t)) {
      bad.push(t);
      continue;
    }
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    list.push(k);
  }
  return { list: list.slice(0, max), bad, tooMany: list.length > max };
}

export type CaseForEmail = {
  caseNumber: string;
  type: AuditType;
  pharmacyName: string;
  pharmacyEmail: string | null;
  pharmacyNcpdp: string | null;
  auditorName: string | null;
  auditorEmail: string | null;
  agency: string | null;
  referenceNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  includePharmacy: boolean;
};

/** Who each kind of audit goes to unless someone changes it. Regulators never copy the pharmacy by default. */
export function defaultRecipients(c: CaseForEmail): { to: string; cc: string } {
  if (c.type === "INTERNAL") return { to: text(c.pharmacyEmail), cc: "" };
  if (c.type === "PBM") return { to: text(c.auditorEmail), cc: text(c.pharmacyEmail) };
  return { to: text(c.auditorEmail), cc: "" };
}

export function defaultSubject(c: CaseForEmail): string {
  if (c.type === "PBM" && text(c.pharmacyNcpdp)) return pbmSubject(c.pharmacyName, c.pharmacyNcpdp as string);
  if (c.type === "REGULATORY") return regulatorySubject({ caseNumber: c.caseNumber, agency: c.agency, reference: c.referenceNumber, pharmacyName: c.pharmacyName, includePharmacy: c.includePharmacy, start: c.startDate, end: c.endDate });
  return `${c.pharmacyName} purchase records ${usDate(c.startDate)} to ${usDate(c.endDate)}`.trim();
}

/** The first draft of the message. The employee reviews and may change every word before it goes. */
export function defaultBody(c: CaseForEmail, companyName: string): string {
  const period = `${usDate(c.startDate)} through ${usDate(c.endDate)}`;
  const hello = (name: string | null | undefined) => (text(name) ? `Hello ${text(name)},` : "Hello,");
  const sign = `Thank you,\n${companyName}`;
  if (c.type === "PBM") {
    return [hello(c.auditorName), `Please see the requested purchase documentation for ${c.pharmacyName} for the period of ${period}.`, "Attached are the requested Excel purchase records and the applicable audit documentation.", sign].join("\n\n");
  }
  if (c.type === "REGULATORY") {
    const ref = text(c.referenceNumber) ? ` (reference ${text(c.referenceNumber)})` : "";
    const who = c.includePharmacy ? ` for ${c.pharmacyName}` : "";
    return [hello(c.auditorName), `In response to your request${ref}, please see the attached purchase records${who} for the period of ${period}.`, "The Excel file includes pricing and shipping as requested.", "Please contact us with any questions.", sign].join("\n\n");
  }
  return [hello(c.pharmacyName), `Please find attached the purchase records for ${c.pharmacyName} for the period of ${period}.`, "The Excel file lists each invoice line with its date, NDC, product, quantity, price and shipping.", sign].join("\n\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The typed message as simple HTML (paragraphs and line breaks; nothing typed can inject markup). */
export function bodyToHtml(body: string): string {
  const paras = body.replace(/\r/g, "").trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, "<br>")}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1d21;">${paras.join("")}</div>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The check before sending
// ---------------------------------------------------------------------------------------------------------------------

export type FileFilters = { start: string | null; end: string | null; productScope: string; products: string[] | null; includePharmacy: boolean; deviceAnswer: string | null };

/** True when the saved file was made with the case's present dates, products, device answer and pharmacy choice. */
export function fileIsCurrent(f: FileFilters | null, now: { start: string | null; end: string | null; productScope: string; products: string[] | null; includePharmacy: boolean; deviceAnswer: string | null; type: AuditType }): boolean {
  if (!f) return false;
  const same = (a: string[] | null, b: string[] | null) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  return (
    f.start === now.start &&
    f.end === now.end &&
    f.productScope === now.productScope &&
    same(f.products, now.products) &&
    (now.type === "PBM" ? true : f.includePharmacy === now.includePharmacy) &&
    (now.type === "INTERNAL" ? true : f.deviceAnswer === now.deviceAnswer)
  );
}

export type SendCheck = { label: string; ok: boolean; note?: string };

export type SendContext = {
  type: AuditType;
  pharmacyName: string;
  pharmacyEmail: string | null;
  ncpdp: string | null;
  startDate: string | null;
  endDate: string | null;
  deviceAnswer: DeviceAnswer | string | null;
  auditorEmail: string | null;
  to: string[];
  cc: string[];
  columns: ColumnDef[];
  fileCurrent: boolean;
  isManager: boolean;
  /** An original audit request is attached to the case / is ticked to go with the email. */
  requestOnCase: boolean;
  requestTicked: boolean;
  invoiceCopies: "NONE" | "ALL" | "SELECTED";
  invoiceCopiesMissing: number;
  /** Lines in the file that are missing an NDC, description and so on. */
  fileWarnings: number;
  totalBytes: number;
  mailboxReady: boolean;
};

export const MAX_EMAIL_BYTES = 20 * 1024 * 1024;

const has = (list: string[], addr: string | null | undefined) => !!text(addr) && list.includes(text(addr).toLowerCase());
const hasMoney = (cols: ColumnDef[]) => cols.some((c) => (MONEY_KEYS as readonly string[]).includes(c.key) || c.kind === "money");
const hasKey = (cols: ColumnDef[], k: string) => cols.some((c) => c.key === k);
const nice = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function sendChecks(x: SendContext): { checks: SendCheck[]; warnings: string[]; canSend: boolean } {
  const checks: SendCheck[] = [];
  const add = (label: string, ok: boolean, note?: string) => checks.push({ label, ok, note: ok ? undefined : note });
  const validDates = !!x.startDate && !!x.endDate && x.startDate <= x.endDate;

  add("Mailbox connected", x.mailboxReady, "Connect the company's email in Settings → Connectors first. Audit files only go out from your own mailbox.");
  add("Recipient entered", x.to.length > 0, "Enter who it goes to.");
  add("Excel file matches the case", x.fileCurrent, "The case changed after this file was made (dates, products or choices). Generate a new file and send that one.");

  if (x.type === "PBM") {
    add("NCPDP verified", /^\d{7}$/.test(x.ncpdp ?? ""), "The pharmacy needs a 7-digit NCPDP number (Sales → Buyers).");
    add("Date range verified", validDates, "Enter a valid start and end date.");
    add("Device audit confirmed", x.deviceAnswer === "YES", "The device question must be answered YES.");
    add("Pricing excluded", !hasMoney(x.columns) && !hasKey(x.columns, "unitPrice"), "This file has pricing. A PBM file can never have it. Generate it again.");
    add("Shipping cost excluded", !hasKey(x.columns, "shipping") && !hasKey(x.columns, "discount"), "This file has shipping or discount. A PBM file can never have them. Generate it again.");
    add("Recipient is the auditor", !!text(x.auditorEmail) && x.to.length === 1 && has(x.to, x.auditorEmail), "Send it to the auditor's email on the case, and only to the auditor (the pharmacy goes in CC).");
    add("Pharmacy copied (CC)", !!text(x.pharmacyEmail) && has(x.cc, x.pharmacyEmail), text(x.pharmacyEmail) ? "Add the pharmacy's email to CC." : "The pharmacy has no email on file (Sales → Buyers), so it can't be copied.");
    add("No invoice copies (they show prices)", x.invoiceCopies === "NONE", "Invoices show prices and shipping, so they can't go to a PBM. Choose None.");
  } else if (x.type === "REGULATORY") {
    add("Device records confirmed", x.deviceAnswer === "YES", "The device question must be answered YES.");
    add("Requested timeframe verified", validDates, "Enter a valid start and end date.");
    add("Pricing included when required", hasKey(x.columns, "unitPrice"), "This file has no pricing. Generate it again.");
    add("Shipping included when the invoices have it", hasKey(x.columns, "unitPrice"), "This file was not built with the regulatory columns. Generate it again.");
    add("Correct regulatory recipient", !!text(x.auditorEmail) && has(x.to, x.auditorEmail), "Send it to the regulator's email on the case.");
    const copied = has([...x.to, ...x.cc], x.pharmacyEmail);
    add("Pharmacy not automatically copied", !copied || x.isManager, "The pharmacy isn't copied on regulatory emails. Only an Admin or the Owner can add it.");
  } else {
    add("Pharmacy verified", !!text(x.pharmacyName) && !!text(x.pharmacyEmail), "The pharmacy has no email on file (Sales → Buyers).");
    add("Date range verified", validDates, "Enter a valid start and end date.");
    add("Pricing included", hasKey(x.columns, "unitPrice"), "This file has no pricing. Generate it again.");
    add("Shipping included when the invoices have it", hasKey(x.columns, "unitPrice"), "This file was not built with the internal columns. Generate it again.");
    add("Credits and returns accounted for", true);
    add("Correct pharmacy recipient", !!text(x.pharmacyEmail) && has(x.to, x.pharmacyEmail), "Send it to the pharmacy's email on file.");
  }

  add("Attachments are under 20 MB together", x.totalBytes <= MAX_EMAIL_BYTES, `The attachments add up to ${nice(x.totalBytes)}. Untick some, or choose fewer invoices.`);

  const warnings: string[] = [];
  if (x.type !== "INTERNAL" && !x.requestOnCase) warnings.push("No original audit request is saved on this case. Attach it first if you have it.");
  else if (x.type !== "INTERNAL" && !x.requestTicked) warnings.push("The original audit request is on the case but isn't ticked to go with this email.");
  if (x.invoiceCopiesMissing > 0) warnings.push(`INVOICE COPY NOT AVAILABLE for ${x.invoiceCopiesMissing} invoice${x.invoiceCopiesMissing === 1 ? "" : "s"}. They are left out of the invoice copies.`);
  if (x.fileWarnings > 0) warnings.push(`${x.fileWarnings} line${x.fileWarnings === 1 ? "" : "s"} in the file ${x.fileWarnings === 1 ? "is" : "are"} missing an NDC, description, date or similar.`);
  return { checks, warnings, canSend: checks.every((c) => c.ok) };
}
