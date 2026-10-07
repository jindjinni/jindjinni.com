import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingCustomers,
  purchasingQuotations,
  receivingAdjustments,
  receivingCustomerEmails,
  receivingPackagePhotos,
  receivingPackages,
  users,
} from "@/db/schema";
import { finalPayout, pickEmailTemplate } from "@/lib/receiving-rules";
import { getEmailTemplates, getReceivingPackage, getReceivingSettings } from "@/lib/receiving-queries";
import { planCustomerEmail } from "@/lib/receiving-service";
import { emailReadiness, type CsOrder } from "@/lib/customer-service-rules";
import { getConnection } from "@/lib/email-connector";

// What the Customer Service department reads. Every query is limited to the signed-in company.

export const CS_LIMIT = 5000;

const select = {
  id: receivingPackages.id,
  status: receivingPackages.status,
  accountsStatus: receivingPackages.accountsStatus,
  paidAt: receivingPackages.paidAt,
  adjustmentNeeded: receivingPackages.adjustmentNeeded,
  overallPackaging: receivingPackages.overallPackaging,
  customerNote: receivingPackages.customerEmailNote,
  adjustmentDetails: receivingPackages.adjustmentDetails,
  adjustedTotal: receivingPackages.adjustedOrderTotal,
  adjustmentAmountEmail: receivingPackages.adjustmentAmountEmail,
  notifiedAt: receivingPackages.customerNotifiedAt,
  quotationNumber: purchasingQuotations.quotationNumber,
  nameSnap: purchasingQuotations.customerNameSnapshot,
  emailSnap: purchasingQuotations.customerEmailSnapshot,
  firstName: purchasingCustomers.firstName,
  lastName: purchasingCustomers.lastName,
  email: purchasingCustomers.email,
  grandTotal: purchasingQuotations.grandTotal,
};

type Row = {
  id: string;
  status: string;
  accountsStatus: string | null;
  paidAt: string | null;
  adjustmentNeeded: string | null;
  overallPackaging: string | null;
  customerNote: string | null;
  adjustmentDetails: string | null;
  adjustedTotal: number | null;
  adjustmentAmountEmail: number | null;
  notifiedAt: string | null;
  quotationNumber: string;
  nameSnap: string;
  emailSnap: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  grandTotal: number;
};

const customerName = (r: Row) => (r.firstName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.nameSnap);
const customerEmail = (r: Row) => r.email?.trim() || null;

async function photoKindCounts(organizationId: string, packageIds: string[]) {
  const out = new Map<string, { receipt: number; revised: number }>();
  if (packageIds.length === 0) return out;
  const rows = await db
    .select({ packageId: receivingPackagePhotos.packageId, kind: receivingPackagePhotos.kind })
    .from(receivingPackagePhotos)
    .where(
      and(
        eq(receivingPackagePhotos.organizationId, organizationId),
        isNull(receivingPackagePhotos.itemId),
        inArray(receivingPackagePhotos.kind, ["PAYMENT_CONFIRMATION", "REVISED_INVOICE"]),
        inArray(receivingPackagePhotos.packageId, packageIds),
      ),
    );
  for (const r of rows) {
    const cur = out.get(r.packageId) ?? { receipt: 0, revised: 0 };
    if (r.kind === "PAYMENT_CONFIRMATION") cur.receipt++;
    else cur.revised++;
    out.set(r.packageId, cur);
  }
  return out;
}

async function finalAdjustments(organizationId: string, packageIds: string[]) {
  const out = new Set<string>();
  if (packageIds.length === 0) return out;
  const rows = await db
    .select({ packageId: receivingAdjustments.packageId })
    .from(receivingAdjustments)
    .where(and(eq(receivingAdjustments.organizationId, organizationId), eq(receivingAdjustments.status, "FINAL"), inArray(receivingAdjustments.packageId, packageIds)));
  for (const r of rows) out.add(r.packageId);
  return out;
}

function toOrder(r: Row, o: { emailsEnabled: boolean; hasWebsiteLink: boolean; senderProblem: string | null; photos: Map<string, { receipt: number; revised: number }>; finals: Set<string>; emailedAt: string | null; count: number }): CsOrder {
  const p = o.photos.get(r.id);
  const readiness = emailReadiness({
    emailsEnabled: o.emailsEnabled,
    hasWebsiteLink: o.hasWebsiteLink,
    senderProblem: o.senderProblem,
    toEmail: customerEmail(r),
    status: r.status,
    accountsStatus: r.accountsStatus,
    hasPaymentReceipt: (p?.receipt ?? 0) > 0,
    adjustmentNeeded: r.adjustmentNeeded === "YES" ? "YES" : r.adjustmentNeeded === "NO" ? "NO" : null,
    customerNote: r.customerNote,
    adjustmentDetails: r.adjustmentDetails,
    adjustedOrderTotal: r.adjustedTotal,
    adjustmentAmountEmail: r.adjustmentAmountEmail,
    hasRevisedInvoice: (p?.revised ?? 0) > 0 || o.finals.has(r.id),
  });
  return {
    id: r.id,
    quotationNumber: r.quotationNumber,
    customerName: customerName(r),
    email: customerEmail(r),
    paidAt: r.paidAt,
    emailedAt: o.emailedAt,
    template: pickEmailTemplate(r),
    amount: finalPayout(r.grandTotal, r.adjustedTotal),
    adjusted: r.adjustedTotal != null && r.adjustedTotal !== r.grandTotal,
    blockers: readiness.blockers,
    emailCount: o.count,
  };
}

/** Orders Accounts has paid whose customer has not been emailed yet. The longest-waiting first. */
export async function getToBeEmailed(organizationId: string): Promise<CsOrder[]> {
  const rows = await db
    .select(select)
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(
      and(
        eq(receivingPackages.organizationId, organizationId),
        eq(receivingPackages.accountsStatus, "PAID"),
        ne(receivingPackages.status, "IN_PROGRESS"),
        isNull(receivingPackages.customerNotifiedAt),
      ),
    )
    .orderBy(receivingPackages.paidAt)
    .limit(CS_LIMIT);
  const ids = rows.map((r) => r.id);
  const [settings, photos, finals, conn] = await Promise.all([getReceivingSettings(organizationId), photoKindCounts(organizationId, ids), finalAdjustments(organizationId, ids), getConnection(organizationId)]);
  return rows.map((r) => toOrder(r, { emailsEnabled: settings.emailsEnabled, hasWebsiteLink: !!settings.quoteLinkUrl.trim(), senderProblem: senderProblemOf(conn), photos, finals, emailedAt: null, count: 0 }));
}

/** Orders the customer was emailed about (the payment email), the most recently emailed first. */
export async function getEmailed(organizationId: string): Promise<CsOrder[]> {
  const sent = await db
    .select({
      packageId: receivingCustomerEmails.packageId,
      last: sql<string>`max(${receivingCustomerEmails.sentAt})`,
      n: sql<number>`count(*)`,
    })
    .from(receivingCustomerEmails)
    .where(and(eq(receivingCustomerEmails.organizationId, organizationId), eq(receivingCustomerEmails.kind, "STATUS")))
    .groupBy(receivingCustomerEmails.packageId)
    .orderBy(desc(sql`max(${receivingCustomerEmails.sentAt})`))
    .limit(CS_LIMIT);
  if (sent.length === 0) return [];
  const rows = await db
    .select(select)
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.id, sent.map((s) => s.packageId))));
  const by = new Map(rows.map((r) => [r.id, r]));
  const empty = { emailsEnabled: true, hasWebsiteLink: true, senderProblem: null, photos: new Map<string, { receipt: number; revised: number }>(), finals: new Set<string>() };
  const out: CsOrder[] = [];
  for (const s of sent) {
    const r = by.get(s.packageId);
    if (!r) continue;
    out.push({ ...toOrder(r, { ...empty, emailedAt: s.last, count: Number(s.n) }), blockers: [] });
  }
  return out;
}

export type SentEmail = {
  id: string;
  kind: "STATUS" | "WARNING";
  template: string;
  toEmail: string;
  bccEmails: string | null;
  subject: string;
  bodyHtml: string;
  attachmentNames: string[];
  skippedAttachments: number;
  sentAt: string;
  sentByName: string | null;
  sentFrom: string | null;
};

function names(json: string | null): string[] {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Every email sent for one order, newest first. */
export async function getSentEmails(organizationId: string, packageId: string): Promise<SentEmail[]> {
  const rows = await db
    .select({ e: receivingCustomerEmails, byName: users.name, byEmail: users.email })
    .from(receivingCustomerEmails)
    .leftJoin(users, eq(users.id, receivingCustomerEmails.sentByUserId))
    .where(and(eq(receivingCustomerEmails.organizationId, organizationId), eq(receivingCustomerEmails.packageId, packageId)))
    .orderBy(desc(receivingCustomerEmails.sentAt), desc(receivingCustomerEmails.id));
  return rows.map(({ e, byName, byEmail }) => ({
    id: e.id,
    kind: e.kind,
    template: e.template,
    toEmail: e.toEmail,
    bccEmails: e.bccEmails,
    subject: e.subject,
    bodyHtml: e.bodyHtml,
    attachmentNames: names(e.attachmentNames),
    skippedAttachments: e.skippedAttachments,
    sentAt: e.sentAt,
    sentByName: byName || byEmail || null,
    sentFrom: e.sentFrom,
  }));
}

export type EmailDraft = {
  packageId: string;
  quotationNumber: string;
  customerName: string;
  to: string | null;
  bcc: string[];
  paidAt: string | null;
  amount: number;
  originalAmount: number;
  adjusted: boolean;
  template: string;
  isAdjustment: boolean;
  subject: string;
  bodyHtml: string;
  note: string;
  alreadyEmailed: boolean;
  packagingWarningSentAt: string | null;
  packagingNotAcceptable: boolean;
  /** Files that will go with the email, in the order they are attached. */
  attachments: { id: string; filename: string; kind: string; contentType: string }[];
  /** The finalized adjusted quotation that will be attached as a PDF (built fresh if no stored copy). */
  adjustmentPdf: { id: string; number: string } | null;
  receiptId: string | null;
  blockers: string[];
  ready: boolean;
  emailsEnabled: boolean;
  /** Who the customer will see as the sender: the connected mailbox, or the platform's address. */
  from: { name: string; address: string | null };
  history: SentEmail[];
};

/** Everything the composer screen shows for one order: the exact email, what is attached, and what (if anything) blocks sending. */
export async function getEmailDraft(org: { organizationId: string; organizationName: string }, packageId: string): Promise<EmailDraft | null> {
  const data = await getReceivingPackage(org.organizationId, packageId);
  if (!data) return null;
  const conn = await getConnection(org.organizationId);
  const { pkg, brief, settings } = data;
  const plan = planCustomerEmail(org.organizationName, data, "STATUS", await getEmailTemplates(org.organizationId));
  const receipts = data.photos.filter((p) => !p.itemId && p.kind === "PAYMENT_CONFIRMATION");
  const adjFinal = data.adjustment?.status === "FINAL" ? data.adjustment : null;
  const readiness = emailReadiness({
    emailsEnabled: settings.emailsEnabled,
    hasWebsiteLink: !!settings.quoteLinkUrl.trim(),
    senderProblem: senderProblemOf(conn),
    toEmail: plan.to,
    status: pkg.status,
    accountsStatus: pkg.accountsStatus,
    hasPaymentReceipt: receipts.length > 0,
    adjustmentNeeded: pkg.adjustmentNeeded === "YES" ? "YES" : pkg.adjustmentNeeded === "NO" ? "NO" : null,
    customerNote: pkg.customerEmailNote,
    adjustmentDetails: pkg.adjustmentDetails,
    adjustedOrderTotal: pkg.adjustedOrderTotal,
    adjustmentAmountEmail: pkg.adjustmentAmountEmail,
    hasRevisedInvoice: data.photos.some((p) => !p.itemId && p.kind === "REVISED_INVOICE") || !!adjFinal,
  });
  const history = await getSentEmails(org.organizationId, packageId);
  const fromName = settings.fromName.trim() || org.organizationName;
  return {
    packageId,
    quotationNumber: brief.quotationNumber,
    customerName: brief.customerName,
    to: plan.to,
    bcc: settings.bccEmails.split(/[,;\s]+/).filter(Boolean),
    paidAt: pkg.paidAt,
    amount: finalPayout(brief.grandTotal, pkg.adjustedOrderTotal),
    originalAmount: brief.grandTotal,
    adjusted: pkg.adjustedOrderTotal != null && pkg.adjustedOrderTotal !== brief.grandTotal,
    template: plan.template,
    isAdjustment: plan.isAdjustment,
    subject: plan.built.subject,
    bodyHtml: plan.built.html,
    note: pkg.customerEmailNote ?? "",
    alreadyEmailed: !!pkg.customerNotifiedAt,
    packagingWarningSentAt: pkg.packagingWarningSentAt,
    packagingNotAcceptable: pkg.overallPackaging === "NOT_ACCEPTABLE",
    attachments: plan.wanted.map((p) => ({ id: p.id, filename: p.filename, kind: p.kind, contentType: p.contentType })),
    adjustmentPdf: plan.isAdjustment && adjFinal ? { id: adjFinal.id, number: adjFinal.number } : null,
    receiptId: receipts[0]?.id ?? null,
    blockers: readiness.blockers,
    ready: readiness.ready,
    emailsEnabled: settings.emailsEnabled,
    from: { name: fromName, address: conn?.accountEmail ?? null },
    history,
  };
}

export { getReceivingSettings };

/** Why the connected mailbox can't send right now, in words an agent can act on; null when it is fine (or none is connected). */
function senderProblemOf(conn: Awaited<ReturnType<typeof getConnection>>): string | null {
  return conn && conn.status !== "ACTIVE" ? `The connected email (${conn.accountEmail}) needs to be reconnected. An Admin can do that in Email Settings.` : null;
}
