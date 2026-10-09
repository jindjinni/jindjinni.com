// Separate operations under one company: reading who can open which workspace, and creating the second operation.
// Every operation is its own organization row (linked to the company's main row), so the platform's usual scoping by organizationId
// keeps its records apart from the other operation's. The company's verification, plan, approval and closing stay on the main row.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, conditions, memberships, organizations, purchasingBonusTiers } from "@/db/schema";
import { setupNewOrgCatalog } from "@/lib/catalog-template";
import { ensureCompanyCode } from "@/lib/company-code";
import { logActivity } from "@/lib/hr-service";
import { defaultConditionRows, defaultPurchasingBonusTierRows, newId } from "@/lib/ids";
import { addOperationBlocker, kindLabel, parseKind, typeFromKind, type OperationKind, type Workspace } from "@/lib/operation-groups-rules";
import { columnsForChoice } from "@/lib/operations-rules";

/** Every workspace the person can open: an active membership in a company that is not closed. */
export async function workspacesOfUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({
      organizationId: organizations.id,
      parent: organizations.parentOrganizationId,
      kind: organizations.operationKind,
      name: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(organizations.closedAt)));
  return rows.map((r) => ({ organizationId: r.organizationId, rootId: r.parent ?? r.organizationId, kind: parseKind(r.kind), role: r.role, companyName: r.name }));
}

/** The company's main row for any of its workspaces. */
export async function rootIdOf(organizationId: string): Promise<string> {
  const [row] = await db.select({ parent: organizations.parentOrganizationId }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return row?.parent ?? organizationId;
}

/** Every workspace of the company this one belongs to (main row first), with its kind. */
export async function groupOf(organizationId: string): Promise<{ organizationId: string; kind: OperationKind | null; isMain: boolean }[]> {
  const rootId = await rootIdOf(organizationId);
  const rows = await db
    .select({ id: organizations.id, kind: organizations.operationKind, parent: organizations.parentOrganizationId })
    .from(organizations)
    .where(eq(organizations.id, rootId));
  const kids = await db.select({ id: organizations.id, kind: organizations.operationKind, parent: organizations.parentOrganizationId }).from(organizations).where(eq(organizations.parentOrganizationId, rootId));
  return [...rows, ...kids].map((r) => ({ organizationId: r.id, kind: parseKind(r.kind), isMain: r.id === rootId }));
}

export type Who = { userId: string; organizationId: string };

/**
 * A company that existed before operations were separated says once what its current records are. After that it can add the other one.
 * Only a workspace with no kind yet can be named.
 */
export async function nameWorkspace(who: Who, kind: OperationKind): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db.select({ kind: organizations.operationKind }).from(organizations).where(eq(organizations.id, who.organizationId)).limit(1);
  if (!row) return { ok: false, error: "Company not found." };
  if (parseKind(row.kind)) return { ok: false, error: "This operation has already been named." };
  await db
    .update(organizations)
    .set({ operationKind: kind, ...columnsForChoice(typeFromKind(kind), new Date(), who.userId) })
    .where(eq(organizations.id, who.organizationId));
  await logActivity(who, "OTHER", `Set these records as the ${kindLabel(kind)} operation`, { type: "organization", id: who.organizationId });
  return { ok: true };
}

/**
 * Adds the other operation as a new, empty workspace: its own catalog starter lists, its own business profile (copied once, then
 * edited on its own, so each side can have its own return address and logo), and owner/admin access for the company's owners and admins.
 */
export async function addOperation(who: Who, canManage: boolean, wanted: OperationKind): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const [me] = await db.select().from(organizations).where(eq(organizations.id, who.organizationId)).limit(1);
  if (!me) return { ok: false, error: "Company not found." };
  const group = await groupOf(who.organizationId);
  const blocker = addOperationBlocker(parseKind(me.operationKind), group.map((g) => g.kind).filter((k): k is OperationKind => !!k), wanted, canManage);
  if (blocker) return { ok: false, error: blocker };

  const rootId = me.parentOrganizationId ?? me.id;
  const [root] = await db.select().from(organizations).where(eq(organizations.id, rootId)).limit(1);
  const orgId = newId("org");
  const slugBase = `${root?.slug ?? me.slug}--${wanted}`;
  const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slugBase)).limit(1);
  const slug = taken ? `${slugBase}-${orgId.slice(-4).toLowerCase()}` : slugBase;

  await db.insert(organizations).values({
    id: orgId,
    name: me.name,
    slug,
    approvalStatus: null, // the company's approval lives on its main row
    parentOrganizationId: rootId,
    shipFromName: me.shipFromName,
    shipFromCompany: me.shipFromCompany,
    shipFromStreet1: me.shipFromStreet1,
    shipFromStreet2: me.shipFromStreet2,
    shipFromCity: me.shipFromCity,
    shipFromState: me.shipFromState,
    shipFromZip: me.shipFromZip,
    shipFromCountry: me.shipFromCountry,
    shipFromPhone: me.shipFromPhone,
    shipFromEmail: me.shipFromEmail,
    ...columnsForChoice(typeFromKind(wanted), new Date(), who.userId),
    operationKind: wanted,
  });
  await ensureCompanyCode(orgId).catch(() => {});

  // The company's owners and admins can open the new operation right away; everyone else is added by an admin from Team & access.
  const people = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.organizationId, who.organizationId), isNull(memberships.deactivatedAt)));
  for (const p of people) {
    if (p.role !== "owner" && p.role !== "admin" && p.userId !== who.userId) continue;
    await db.insert(memberships).values({ id: newId("mem"), userId: p.userId, organizationId: orgId, role: p.userId === who.userId && p.role !== "owner" && p.role !== "admin" ? "admin" : p.role });
  }

  await db.insert(conditions).values(defaultConditionRows(orgId));
  await setupNewOrgCatalog(orgId);
  await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(orgId));
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.organizationId, who.organizationId)).limit(1);
  if (profile) {
    const { id: _id, organizationId: _o, ...rest } = profile;
    void _id;
    void _o;
    await db.insert(businessProfiles).values({ ...rest, id: newId("bizprofile"), organizationId: orgId });
  }
  await logActivity(who, "OTHER", `Added the ${kindLabel(wanted)} operation`, { type: "organization", id: orgId });
  return { ok: true, organizationId: orgId };
}
