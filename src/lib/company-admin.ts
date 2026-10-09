// The platform owner's view of every company on the platform: counts, a searchable/filterable page of companies, the
// history of decisions about each, and the one place a decision is written down. Built to stay fast with ~10,000 companies:
// every list is paged in the database (never loaded whole) and the proof documents are never selected here.

import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, businessVerifications, companyDecisions, memberships, organizations, users } from "@/db/schema";
import { ensureCompanyCode } from "@/lib/company-code";
import { newId } from "@/lib/ids";

export const PAGE_SIZE = 25;

/** What a company can be. "approved" also covers every company from before approvals existed (empty status). */
export type CompanyStatus = "pending" | "approved" | "rejected" | "suspended" | "banned";

export type CompanyFilter = "all" | "waiting" | "active" | "suspended" | "turned_down" | "banned";
export const FILTERS: { key: CompanyFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "turned_down", label: "Turned down" },
  { key: "banned", label: "Banned" },
];

export function normalizeStatus(s: string | null): CompanyStatus {
  return s === "pending" || s === "rejected" || s === "suspended" || s === "banned" ? s : "approved";
}

export function parseFilter(raw: string | undefined): CompanyFilter {
  return FILTERS.some((f) => f.key === raw) ? (raw as CompanyFilter) : "all";
}

function filterWhere(filter: CompanyFilter): SQL | undefined {
  switch (filter) {
    case "waiting": return eq(organizations.approvalStatus, "pending");
    case "active": return or(isNull(organizations.approvalStatus), eq(organizations.approvalStatus, "approved"));
    case "suspended": return eq(organizations.approvalStatus, "suspended");
    case "turned_down": return eq(organizations.approvalStatus, "rejected");
    case "banned": return eq(organizations.approvalStatus, "banned");
    default: return undefined;
  }
}

/** Matches a typed search against name, web address, EIN (with or without the dash) and the two email addresses. */
function searchWhere(q: string): SQL | undefined {
  const term = q.trim().slice(0, 80).toLowerCase();
  if (!term) return undefined;
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = term.replace(/[\s-]/g, "");
  const parts: SQL[] = [
    sql`lower(${organizations.name}) like ${like} escape '\\'`,
    sql`lower(${organizations.slug}) like ${like} escape '\\'`,
    sql`lower(${organizations.companyCode}) like ${like} escape '\\'`,
    sql`lower(${businessVerifications.ein}) like ${like} escape '\\'`,
    sql`lower(${businessProfiles.businessEmail}) like ${like} escape '\\'`,
    sql`lower(${businessProfiles.primaryContactEmail}) like ${like} escape '\\'`,
  ];
  if (/^\d{3,9}$/.test(digits)) parts.push(sql`replace(${businessVerifications.ein}, '-', '') like ${`%${digits}%`}`);
  return or(...parts);
}

export type CompanyCounts = { total: number; waiting: number; active: number; suspended: number; turnedDown: number; banned: number; newThisWeek: number };

export async function companyCounts(): Promise<CompanyCounts> {
  const [r] = await db
    .select({
      total: sql<number>`count(*)`,
      waiting: sql<number>`coalesce(sum(case when ${organizations.approvalStatus} = 'pending' then 1 else 0 end), 0)`,
      suspended: sql<number>`coalesce(sum(case when ${organizations.approvalStatus} = 'suspended' then 1 else 0 end), 0)`,
      turnedDown: sql<number>`coalesce(sum(case when ${organizations.approvalStatus} = 'rejected' then 1 else 0 end), 0)`,
      banned: sql<number>`coalesce(sum(case when ${organizations.approvalStatus} = 'banned' then 1 else 0 end), 0)`,
      newThisWeek: sql<number>`coalesce(sum(case when ${organizations.createdAt} >= datetime('now', '-7 days') then 1 else 0 end), 0)`,
    })
    .from(organizations)
    .where(isNull(organizations.parentOrganizationId)); // one line per company; its operations are inside
  const total = Number(r?.total ?? 0);
  const waiting = Number(r?.waiting ?? 0);
  const suspended = Number(r?.suspended ?? 0);
  const turnedDown = Number(r?.turnedDown ?? 0);
  const banned = Number(r?.banned ?? 0);
  return { total, waiting, active: total - waiting - suspended - turnedDown - banned, suspended, turnedDown, banned, newThisWeek: Number(r?.newThisWeek ?? 0) };
}

/** How many companies are waiting for a decision (the number in the Settings menu). */
export async function waitingCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(organizations).where(and(eq(organizations.approvalStatus, "pending"), isNull(organizations.parentOrganizationId)));
  return Number(r?.n ?? 0);
}

export type DecisionEntry = { id: string; decision: string; reason: string | null; createdAt: string };

import { needsConfirmation, sidesFrom, sidesLabel, type OperationsRow } from "@/lib/operations-rules";

function sidesText(row: OperationsRow, otherKinds: string[] = []): string {
  if (row.operationKind) {
    const all = [row.operationKind, ...otherKinds].map((k) => (k === "wholesale" ? "Wholesale" : "Distribution"));
    return all.length > 1 ? `${all.join(" and ")} (two separate operations)` : all[0];
  }
  return sidesLabel(sidesFrom(row)) + (needsConfirmation(row) ? " (records not named yet)" : "");
}

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  /** The company's permanent reference, e.g. "JJ-1042". */
  code: string;
  status: CompanyStatus;
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
  billingPlan: string | null;
  paymentStatus: string | null;
  trialStartsOn: string | null;
  firstBillableOn: string | null;
  cancelRequestedOn: string | null;
  serviceEndsOn: string | null;
  cancelRefundCents: number | null;
  paymentGraceEndsAt: string | null;
  lastPaymentAt: string | null;
  /** Which sides the company runs, in words: "Wholesale", "Distribution" or "Wholesale and Distribution" (plus "not confirmed yet"). */
  sides: string;
  ein: string | null;
  registeredState: string | null;
  entityType: string | null;
  stateFileNumber: string | null;
  yearFormed: number | null;
  businessType: string | null;
  businessDescription: string | null;
  proofType: string | null;
  proofFileName: string | null;
  submittedAt: string | null;
  registryStatus: string | null;
  registryDetail: string | null;
  registryCheckedAt: string | null;
  businessEmail: string | null;
  website: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  state: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  teamSize: number;
  lastSignIn: string | null;
  history: DecisionEntry[];
};

export type CompanyPage = { rows: CompanyRow[]; total: number; page: number; pages: number };

/** One page of companies: waiting ones first, then newest first. */
export async function listCompanies(opts: { q?: string; filter?: CompanyFilter; page?: number; id?: string }): Promise<CompanyPage> {
  const filter = opts.filter ?? "all";
  const where = and(isNull(organizations.parentOrganizationId), filterWhere(filter), searchWhere(opts.q ?? ""), opts.id ? eq(organizations.id, opts.id) : undefined);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(organizations)
    .leftJoin(businessVerifications, eq(businessVerifications.organizationId, organizations.id))
    .leftJoin(businessProfiles, eq(businessProfiles.organizationId, organizations.id))
    .where(where);
  const total = Number(n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pages);

  // Never select proofData here: a page of companies must not drag 25 documents out of the database.
  const base = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      code: organizations.companyCode,
      status: organizations.approvalStatus,
      reason: organizations.approvalReason,
      decidedAt: organizations.approvalDecidedAt,
      createdAt: organizations.createdAt,
      billingPlan: organizations.billingPlan,
      paymentStatus: organizations.paymentStatus,
      trialStartsOn: organizations.trialStartsOn,
      firstBillableOn: organizations.firstBillableOn,
      cancelRequestedOn: organizations.cancelRequestedOn,
      serviceEndsOn: organizations.serviceEndsOn,
      cancelRefundCents: organizations.cancelRefundCents,
      paymentGraceEndsAt: organizations.paymentGraceEndsAt,
      lastPaymentAt: organizations.lastPaymentAt,
      opType: organizations.operationType,
      opWholesale: organizations.wholesaleActiveAt,
      opDistribution: organizations.distributionActiveAt,
      opChosen: organizations.operationsChosenAt,
      opKind: organizations.operationKind,
      ein: businessVerifications.ein,
      registeredState: businessVerifications.registeredState,
      entityType: businessVerifications.entityType,
      stateFileNumber: businessVerifications.stateFileNumber,
      yearFormed: businessVerifications.yearFormed,
      businessType: businessVerifications.businessType,
      businessDescription: businessVerifications.businessDescription,
      proofType: businessVerifications.proofType,
      proofFileName: businessVerifications.proofFileName,
      submittedAt: businessVerifications.submittedAt,
      registryStatus: businessVerifications.registryStatus,
      registryDetail: businessVerifications.registryDetail,
      registryCheckedAt: businessVerifications.registryCheckedAt,
      businessEmail: businessProfiles.businessEmail,
      website: businessProfiles.website,
      contactFirst: businessProfiles.primaryContactFirstName,
      contactLast: businessProfiles.primaryContactLastName,
      contactEmail: businessProfiles.primaryContactEmail,
      contactPhone: businessProfiles.primaryContactPhone,
      city: businessProfiles.businessAddressCity,
      state: businessProfiles.businessAddressState,
    })
    .from(organizations)
    .leftJoin(businessVerifications, eq(businessVerifications.organizationId, organizations.id))
    .leftJoin(businessProfiles, eq(businessProfiles.organizationId, organizations.id))
    .where(where)
    .orderBy(sql`case when ${organizations.approvalStatus} = 'pending' then 0 else 1 end`, desc(organizations.createdAt), organizations.id)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const ids = base.map((b) => b.id);
  if (ids.length === 0) return { rows: [], total, page, pages };
  // Companies that have no reference yet get theirs the first time the owner's panel shows them.
  for (const b of base) if (!b.code) b.code = await ensureCompanyCode(b.id);

  const [team, owners, last, hist] = await Promise.all([
    db
      .select({ orgId: memberships.organizationId, n: sql<number>`count(*)` })
      .from(memberships)
      .where(and(inArray(memberships.organizationId, ids), isNull(memberships.deactivatedAt)))
      .groupBy(memberships.organizationId),
    db
      .select({ orgId: memberships.organizationId, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(inArray(memberships.organizationId, ids), eq(memberships.role, "owner"), isNull(memberships.deactivatedAt)))
      .orderBy(memberships.createdAt),
    db
      .select({ orgId: memberships.organizationId, at: sql<string | null>`max(${users.lastLoginAt})` })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(inArray(memberships.organizationId, ids), isNull(memberships.deactivatedAt)))
      .groupBy(memberships.organizationId),
    db
      .select({ id: companyDecisions.id, orgId: companyDecisions.organizationId, decision: companyDecisions.decision, reason: companyDecisions.reason, createdAt: companyDecisions.createdAt })
      .from(companyDecisions)
      .where(inArray(companyDecisions.organizationId, ids))
      .orderBy(desc(companyDecisions.createdAt)),
  ]);

  const teamBy = new Map(team.map((t) => [t.orgId, Number(t.n)]));
  const ownerBy = new Map<string, { name: string | null; email: string }>();
  for (const o of owners) if (!ownerBy.has(o.orgId)) ownerBy.set(o.orgId, { name: o.name, email: o.email });
  const lastBy = new Map(last.map((l) => [l.orgId, l.at]));
  const histBy = new Map<string, DecisionEntry[]>();
  for (const h of hist) {
    const list = histBy.get(h.orgId) ?? [];
    if (list.length < 6) list.push({ id: h.id, decision: h.decision, reason: h.reason, createdAt: h.createdAt });
    histBy.set(h.orgId, list);
  }

  // A company's other operations (its separate workspaces), for the "Operation" line.
  const kids = ids.length ? await db.select({ parent: organizations.parentOrganizationId, kind: organizations.operationKind }).from(organizations).where(inArray(organizations.parentOrganizationId, ids)) : [];
  const kidKinds = new Map<string, string[]>();
  for (const k of kids) if (k.parent && k.kind) kidKinds.set(k.parent, [...(kidKinds.get(k.parent) ?? []), k.kind]);

  const rows: CompanyRow[] = base.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    code: b.code ?? "",
    status: normalizeStatus(b.status),
    reason: b.reason,
    decidedAt: b.decidedAt,
    createdAt: b.createdAt,
    billingPlan: b.billingPlan,
    paymentStatus: b.paymentStatus,
    trialStartsOn: b.trialStartsOn,
    firstBillableOn: b.firstBillableOn,
    cancelRequestedOn: b.cancelRequestedOn,
    serviceEndsOn: b.serviceEndsOn,
    cancelRefundCents: b.cancelRefundCents,
    paymentGraceEndsAt: b.paymentGraceEndsAt,
    lastPaymentAt: b.lastPaymentAt,
    sides: sidesText({ operationType: b.opType, wholesaleActiveAt: b.opWholesale, distributionActiveAt: b.opDistribution, operationsChosenAt: b.opChosen, operationKind: b.opKind }, kidKinds.get(b.id) ?? []),
    ein: b.ein,
    registeredState: b.registeredState,
    entityType: b.entityType,
    stateFileNumber: b.stateFileNumber,
    yearFormed: b.yearFormed,
    businessType: b.businessType,
    businessDescription: b.businessDescription,
    proofType: b.proofType,
    proofFileName: b.proofFileName,
    submittedAt: b.submittedAt,
    registryStatus: b.registryStatus,
    registryDetail: b.registryDetail,
    registryCheckedAt: b.registryCheckedAt,
    businessEmail: b.businessEmail,
    website: b.website,
    contactName: [b.contactFirst, b.contactLast].filter(Boolean).join(" "),
    contactEmail: b.contactEmail,
    contactPhone: b.contactPhone,
    city: b.city,
    state: b.state,
    ownerName: ownerBy.get(b.id)?.name ?? null,
    ownerEmail: ownerBy.get(b.id)?.email ?? null,
    teamSize: teamBy.get(b.id) ?? 0,
    lastSignIn: lastBy.get(b.id) ?? null,
    history: histBy.get(b.id) ?? [],
  }));
  return { rows, total, page, pages };
}

/** Writes one line in a company's decision history. */
export async function logDecision(organizationId: string, decision: string, reason: string | null, decidedByUserId: string | null): Promise<void> {
  await db.insert(companyDecisions).values({ id: newId("cdec"), organizationId, decision, reason, decidedByUserId });
}

export const DECISION_LABELS: Record<string, string> = {
  submitted: "Signed up",
  resubmitted: "Sent details again",
  approved: "Approved",
  turned_down: "Turned down",
  suspended: "Suspended",
  banned: "Banned",
  reinstated: "Reinstated",
  details_updated: "Updated details",
  plan_cancelled: "Cancelled plan",
  cancellation_undone: "Kept plan",
  plan_ended: "Plan ended",
  ban_lifted: "Ban lifted",
};
