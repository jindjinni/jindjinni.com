// Settings -> Company emails: one address per department, typed once, kept on the department's shared mailbox as "planned"
// until someone connects it. Everything is scoped by the company; only an owner or admin may save (the action checks, and so do we).

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxes, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { logActivity } from "@/lib/hr-service";
import { isAdmin } from "@/lib/permissions";
import { checkPlannedAddress, companyDomain, emailDeptsFor, normalizeEmail, suggestedAddress } from "@/lib/email-setup-rules";
import { DEPT_LABEL, DEPT_MAIL_BLURB, type MailDept } from "@/lib/mail-rules";
import { operationsOf } from "@/lib/operations-service";
import type { CurrentOrg } from "@/lib/tenant";

type OrgCtx = Pick<CurrentOrg, "userId" | "organizationId" | "organizationName" | "role" | "access" | "viewAs">;

export type PlanRow = {
  dept: MailDept;
  label: string;
  blurb: string;
  mailboxId: string | null;
  planned: string | null;
  accountEmail: string | null;
  status: "NOT_CONNECTED" | "ACTIVE" | "NEEDS_RECONNECT";
  suggested: string;
};
export type EmailPlan = { domain: string | null; rows: PlanRow[] };

async function adminEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId));
  return rows.filter((r) => r.role === "owner").concat(rows.filter((r) => r.role === "admin")).map((r) => r.email);
}

async function sharedBoxes(organizationId: string) {
  return db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.organizationId, organizationId), eq(mailboxes.kind, "SHARED"), isNull(mailboxes.hiddenAt)))
    .orderBy(asc(mailboxes.createdAt));
}

export async function loadEmailPlan(organizationId: string): Promise<EmailPlan> {
  const [sides, boxes, emails] = await Promise.all([operationsOf(organizationId), sharedBoxes(organizationId), adminEmails(organizationId)]);
  const connected = boxes.map((b) => b.accountEmail).concat(boxes.map((b) => b.plannedEmail));
  const domain = companyDomain([...connected, ...emails]);
  const rows: PlanRow[] = emailDeptsFor(sides).map((dept) => {
    const b = boxes.find((x) => x.department === dept);
    return {
      dept,
      label: DEPT_LABEL[dept],
      blurb: DEPT_MAIL_BLURB[dept],
      mailboxId: b?.id ?? null,
      planned: b?.plannedEmail ?? null,
      accountEmail: b?.accountEmail ?? null,
      status: b?.status === "ACTIVE" || b?.status === "NEEDS_RECONNECT" ? b.status : "NOT_CONNECTED",
      suggested: suggestedAddress(dept, domain),
    };
  });
  return { domain, rows };
}

export type SaveResult = { ok: true; saved: number; warnings: string[] } | { ok: false; error: string; field?: MailDept };

/** `entries`: the address typed for each department (blank = none yet). A connected mailbox keeps its connected address. */
export async function saveEmailPlan(org: OrgCtx, entries: { dept: MailDept; email: string }[]): Promise<SaveResult> {
  if (!isAdmin(org.role) || org.viewAs) return { ok: false, error: "Only an owner or admin can set up the company's emails." };
  const plan = await loadEmailPlan(org.organizationId);
  const allowed = new Set(plan.rows.map((r) => r.dept));
  const boxes = await sharedBoxes(org.organizationId);
  const typed = entries.filter((e) => allowed.has(e.dept) && normalizeEmail(e.email));
  const warnings: string[] = [];

  // The addresses already taken by connected mailboxes (a mailbox of another department) can't be typed again.
  const taken = (dept: MailDept) =>
    boxes.filter((b) => b.department !== dept && b.accountEmail).map((b) => normalizeEmail(b.accountEmail));
  for (const e of typed) {
    const row = plan.rows.find((r) => r.dept === e.dept)!;
    if (row.status === "ACTIVE") continue; // connected: nothing to change here
    const others = typed.filter((t) => t.dept !== e.dept).map((t) => t.email).concat(taken(e.dept));
    const c = checkPlannedAddress(e.email, plan.domain, others);
    if (!c.ok) return { ok: false, error: `${DEPT_LABEL[e.dept]}: ${c.error}`, field: e.dept };
    if (c.warning) warnings.push(`${DEPT_LABEL[e.dept]}: ${c.warning}`);
  }

  let saved = 0;
  for (const row of plan.rows) {
    if (row.status === "ACTIVE") continue;
    const e = entries.find((x) => x.dept === row.dept);
    if (!e) continue;
    const email = normalizeEmail(e.email) || null;
    if (email === (row.planned ?? null)) continue;
    if (row.mailboxId) {
      await db.update(mailboxes).set({ plannedEmail: email }).where(and(eq(mailboxes.id, row.mailboxId), eq(mailboxes.organizationId, org.organizationId)));
    } else if (email) {
      await db.insert(mailboxes).values({ id: newId("mbx"), organizationId: org.organizationId, department: row.dept, kind: "SHARED", name: DEPT_LABEL[row.dept], plannedEmail: email, createdByUserId: org.userId });
    }
    saved++;
  }
  if (saved) await logActivity(org, "OTHER", `Company emails set up: ${saved} department address${saved === 1 ? "" : "es"} saved`, { type: "organization", id: org.organizationId });
  return { ok: true, saved, warnings };
}
