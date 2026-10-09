"use server";

// The Staff page of the mothership: add a co-owner, admin or customer support person, change their level, give a new temporary
// password, remove them. Every action re-checks on the SERVER who is asking and which level they may manage.

import bcrypt from "bcryptjs";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { memberships, platformStaff, purchasingAuditLog, signInEvents, supportMessages, supportViewSessions, teamInvitations, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { LEVEL_LABELS, GRANTABLE_LEVELS, mayManageLevel, type StaffLevel } from "@/lib/mothership-rules";
import { staffLevelOf } from "@/lib/platform-admin";
import { GRANTABLE_DEPTS, serializeAccess, type Access } from "@/lib/permissions";
import { generatePassword } from "@/lib/staff-login";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";

export type StaffState = { error?: string; message?: string; credentials?: { name: string; email: string; password: string } } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Customer support: every department to work in (they see how the system works), but never Settings. */
const SUPPORT_ACCESS: Access = Object.fromEntries(GRANTABLE_DEPTS.map((d) => [d, "work" as const]));

async function actor(): Promise<{ org: CurrentOrg; level: StaffLevel }> {
  const org = await requireOrg({ real: true });
  const level = await staffLevelOf(org);
  if (!level) throw new Error("Not allowed.");
  return { org, level };
}

async function audit(org: CurrentOrg, recordId: string, from: string | null, to: string | null, note: string) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "team",
    recordId,
    fieldName: "staff",
    previousValue: from,
    newValue: to,
    note,
  });
}

/** The company role that goes with a staff level: full levels are company Admins; support gets every department to work in. */
function roleFor(level: Exclude<StaffLevel, "owner">) {
  return level === "support" ? { role: "custom" as const, deptAccess: serializeAccess(SUPPORT_ACCESS) } : { role: "admin" as const, deptAccess: null };
}

export async function addStaffPerson(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const { org, level: mine } = await actor();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const level = String(formData.get("level") ?? "") as Exclude<StaffLevel, "owner">;
  if (!name || name.length > 100) return { error: "Enter the person's name." };
  if (!EMAIL_RE.test(email) || email.length > 200) return { error: "Enter a real email address; it is what they sign in with." };
  if (!GRANTABLE_LEVELS.includes(level)) return { error: "Choose a level." };
  if (!mayManageLevel(mine, level)) return { error: `You can't add a ${LEVEL_LABELS[level].toLowerCase()}.` };

  const [existing] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
  const fit = roleFor(level);
  if (existing) {
    const mem = await db.select({ id: memberships.id, organizationId: memberships.organizationId, role: memberships.role }).from(memberships).where(and(eq(memberships.userId, existing.id), isNull(memberships.deactivatedAt)));
    const here = mem.find((m) => m.organizationId === org.organizationId);
    if (!here) {
      return { error: mem.length > 0 ? "That person already belongs to another company. Staff need their own login for the Lamp." : "That email already has an account. Ask them to use a different email, or contact them." };
    }
    if (here.role === "owner") return { error: "That's the Owner." };
    const [cur] = await db.select({ level: platformStaff.level }).from(platformStaff).where(eq(platformStaff.userId, existing.id)).limit(1);
    if (cur && !mayManageLevel(mine, cur.level as StaffLevel)) return { error: `You can't change a ${LEVEL_LABELS[cur.level as StaffLevel]?.toLowerCase() ?? "staff person"}.` };
    await db.batch([
      db.update(memberships).set({ role: fit.role, deptAccess: fit.deptAccess }).where(eq(memberships.id, here.id)),
      ...(cur
        ? [db.update(platformStaff).set({ level, updatedAt: new Date().toISOString() }).where(eq(platformStaff.userId, existing.id))]
        : [db.insert(platformStaff).values({ id: newId("pstaff"), userId: existing.id, level, addedBy: org.userId })]),
    ]);
    await audit(org, existing.id, cur?.level ?? null, level, `${email} is now ${LEVEL_LABELS[level]}`);
    revalidatePath("/dashboard/lamp/staff");
    return { message: `${existing.name || email} is now ${LEVEL_LABELS[level]}.` };
  }

  const password = generatePassword();
  const userId = newId("user");
  await db.batch([
    db.insert(users).values({ id: userId, email, name, passwordHash: await bcrypt.hash(password, 10), managedByOrgId: org.organizationId, mustChangePassword: true }),
    db.insert(memberships).values({ id: newId("mem"), userId, organizationId: org.organizationId, role: fit.role, deptAccess: fit.deptAccess }),
    db.insert(platformStaff).values({ id: newId("pstaff"), userId, level, addedBy: org.userId }),
  ]);
  await audit(org, userId, null, level, `${email} added as ${LEVEL_LABELS[level]}`);
  revalidatePath("/dashboard/lamp/staff");
  return { message: `${name} added as ${LEVEL_LABELS[level]}. Give them this temporary password now. It is shown only once, and they choose their own at first sign-in.`, credentials: { name, email, password } };
}

async function loadTarget(org: CurrentOrg, userId: string) {
  const [row] = await db
    .select({ userId: users.id, name: users.name, email: users.email, membershipId: memberships.id, role: memberships.role, level: platformStaff.level, managedBy: users.managedByOrgId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(platformStaff, eq(platformStaff.userId, users.id))
    .where(and(eq(memberships.organizationId, org.organizationId), eq(memberships.userId, userId), isNull(memberships.deactivatedAt)))
    .limit(1);
  return row;
}

export async function changeStaffLevel(userId: string, _prev: StaffState, formData: FormData): Promise<StaffState> {
  const { org, level: mine } = await actor();
  const next = String(formData.get("level") ?? "") as Exclude<StaffLevel, "owner">;
  if (!GRANTABLE_LEVELS.includes(next)) return { error: "Choose a level." };
  const t = await loadTarget(org, userId);
  if (!t || t.role === "owner" || !t.level) return { error: "Staff person not found." };
  if (t.userId === org.userId) return { error: "You can't change your own level." };
  if (!mayManageLevel(mine, t.level as StaffLevel) || !mayManageLevel(mine, next)) return { error: "You can't make that change." };
  const fit = roleFor(next);
  await db.batch([
    db.update(platformStaff).set({ level: next, updatedAt: new Date().toISOString() }).where(eq(platformStaff.userId, userId)),
    db.update(memberships).set({ role: fit.role, deptAccess: fit.deptAccess }).where(eq(memberships.id, t.membershipId)),
  ]);
  await audit(org, userId, t.level, next, `${t.email} changed from ${LEVEL_LABELS[t.level as StaffLevel]} to ${LEVEL_LABELS[next]}`);
  revalidatePath("/dashboard/lamp/staff");
  return { message: `${t.name || t.email} is now ${LEVEL_LABELS[next]}.` };
}

export async function removeStaffPerson(userId: string, _prev: StaffState, _formData: FormData): Promise<StaffState> {
  const { org, level: mine } = await actor();
  const t = await loadTarget(org, userId);
  if (!t || t.role === "owner" || !t.level) return { error: "Staff person not found." };
  if (t.userId === org.userId) return { error: "You can't remove yourself." };
  if (!mayManageLevel(mine, t.level as StaffLevel)) return { error: "You can't remove this person." };
  await db.batch([
    db.delete(platformStaff).where(eq(platformStaff.userId, userId)),
    db.update(memberships).set({ deactivatedAt: new Date().toISOString() }).where(eq(memberships.id, t.membershipId)),
  ]);
  await audit(org, userId, t.level, null, `${t.email} removed from the team`);
  revalidatePath("/dashboard/lamp/staff");
  return { message: `${t.name || t.email} is off the team and can no longer sign in. (Settings → Team & access can switch them back on.)` };
}

/** A new temporary password for someone this company created (they lost it). Also clears a sign-in pause. */
export async function newStaffPassword(userId: string, _prev: StaffState, _formData: FormData): Promise<StaffState> {
  const { org, level: mine } = await actor();
  const t = await loadTarget(org, userId);
  if (!t || t.role === "owner" || !t.level) return { error: "Staff person not found." };
  if (!mayManageLevel(mine, t.level as StaffLevel)) return { error: "You can't change this person's password." };
  if (t.managedBy !== org.organizationId) return { error: "This person chose their own login, so they reset the password themselves with Forgot password." };
  const password = generatePassword();
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  await audit(org, userId, null, null, `New temporary password for ${t.email}`);
  return { message: "New temporary password created. It is shown only once.", credentials: { name: t.name || t.email, email: t.email, password } };
}

/** Lost phone and backup codes: turn off a staff person's two-step so they can sign in and set it up again. */
export async function resetStaffTwoStep(userId: string, _prev: StaffState, _formData: FormData): Promise<StaffState> {
  const { org, level: mine } = await actor();
  const t = await loadTarget(org, userId);
  if (!t || t.role === "owner" || !t.level) return { error: "Staff person not found." };
  if (!mayManageLevel(mine, t.level as StaffLevel)) return { error: "You can't change this person's sign-in." };
  const [u] = await db.select({ on: users.totpEnabledAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.on) return { error: "Two-step sign-in isn't on for this person." };
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpBackupCodes: null, totpLastStep: null }).where(eq(users.id, userId));
  await audit(org, userId, "on", "off", `Two-step reset for ${t.email}`);
  revalidatePath("/dashboard/lamp/staff");
  return { message: `Two-step sign-in is off for ${t.name || t.email}. They can turn it on again in My account.` };
}

/** The address a deleted person's login is changed to. It can never receive mail or sign in, and it frees the real address for reuse. */
const DELETED_EMAIL_DOMAIN = "deleted.invalid";
const FORMER_STAFF_NAME = "Former staff member";

/**
 * Deletes a staff person from the whole system for good: their login stops working at once, their name, email, password, two-step,
 * sign-in history and invitations are erased, and their name is removed from tickets and the company-visible access log. The
 * (now nameless) record stays only so the company records they touched (quotes, receipts, the audit log) still add up.
 * Needs the person's email typed to confirm. Same rules as everywhere: nobody deletes the Owner or themselves; the Owner and
 * co-owners delete anyone; an admin deletes customer support people only. A person who also belongs to another company is refused.
 */
export async function deleteStaffPerson(userId: string, _prev: StaffState, formData: FormData): Promise<StaffState> {
  const { org, level: mine } = await actor();
  const [t] = await db
    .select({ userId: users.id, name: users.name, email: users.email, membershipId: memberships.id, role: memberships.role, offAt: memberships.deactivatedAt, level: platformStaff.level })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(platformStaff, eq(platformStaff.userId, users.id))
    .where(and(eq(memberships.organizationId, org.organizationId), eq(memberships.userId, userId)))
    .limit(1);
  if (!t || t.role === "owner") return { error: "Staff person not found." };
  if (t.userId === org.userId) return { error: "You can't delete yourself." };
  if (t.email.endsWith(`@${DELETED_EMAIL_DOMAIN}`)) return { error: "That person is already deleted." };
  if (t.level) {
    if (!mayManageLevel(mine, t.level as StaffLevel)) return { error: "You can't delete this person." };
  } else if (!t.offAt || (mine !== "owner" && mine !== "co_owner")) {
    // Not on the staff list: only someone already removed from the team can be deleted here, and only by the Owner or a co-owner.
    return { error: "You can't delete this person." };
  }
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== t.email.toLowerCase()) return { error: "Type the person's email exactly to confirm." };
  const [elsewhere] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), ne(memberships.organizationId, org.organizationId), isNull(memberships.deactivatedAt)))
    .limit(1);
  if (elsewhere) return { error: "This person also works in another company, so their login can't be deleted from here." };

  const now = new Date().toISOString();
  await db.batch([
    db.delete(platformStaff).where(eq(platformStaff.userId, userId)),
    db.update(memberships).set({ deactivatedAt: t.offAt ?? now }).where(eq(memberships.id, t.membershipId)),
    db.delete(signInEvents).where(eq(signInEvents.userId, userId)),
    db.delete(teamInvitations).where(eq(teamInvitations.email, t.email)),
    db.update(supportMessages).set({ authorName: FORMER_STAFF_NAME }).where(eq(supportMessages.authorUserId, userId)),
    db.update(supportViewSessions).set({ adminName: FORMER_STAFF_NAME }).where(eq(supportViewSessions.adminUserId, userId)),
    db
      .update(users)
      .set({
        email: `deleted-${userId}@${DELETED_EMAIL_DOMAIN}`,
        name: FORMER_STAFF_NAME,
        username: null,
        passwordHash: null,
        emailVerified: null,
        image: null,
        managedByOrgId: null,
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: "9999-12-31T00:00:00.000Z",
        lastLoginAt: null,
        totpSecret: null,
        totpEnabledAt: null,
        totpBackupCodes: null,
        totpLastStep: null,
      })
      .where(eq(users.id, userId)),
  ]);
  // The note names no one: the person's details are gone on purpose.
  await audit(org, userId, t.level ?? "removed", "deleted", `Staff person deleted from the system (${t.level ? LEVEL_LABELS[t.level as StaffLevel] : "already removed"})`);
  revalidatePath("/dashboard/lamp/staff");
  return { message: "Deleted from the system. Their login, name and email are erased." };
}
