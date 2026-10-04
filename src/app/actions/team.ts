"use server";

// Admin panel: invite people, change roles, switch access off and on. Every
// action here re-checks on the SERVER that the caller is an owner/admin of
// the company the record belongs to -- hiding a button is never the guard.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, isNull, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { memberships, organizations, purchasingAuditLog, teamInvitations, users } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { auth, signIn } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { sendEmail } from "@/lib/email";
import { ASSIGNABLE_ROLES, ROLE_LABELS, isAdmin, isRole, type Role } from "@/lib/permissions";
import { getSeatUsage } from "@/lib/seats";
import { INVITE_VALID_DAYS, lookupInvitation, newInviteToken } from "@/lib/invitations";

export type TeamActionState =
  | { error?: string; message?: string; inviteLink?: string; emailed?: boolean; inviteEmail?: string }
  | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) throw new Error("Only an owner or admin can manage the team.");
  return org;
}

async function audit(org: CurrentOrg, recordId: string, field: string, from: string | null, to: string | null, note: string) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "team",
    recordId,
    fieldName: field,
    previousValue: from,
    newValue: to,
    note,
  });
}

async function originFromRequest(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function emailInvite(opts: { to: string; companyName: string; roleLabel: string; inviterName: string; link: string }) {
  const { to, companyName, roleLabel, inviterName, link } = opts;
  return sendEmail({
    to,
    subject: `${inviterName} invited you to join ${companyName}`,
    text: `${inviterName} invited you to join ${companyName} on Jindjinni as ${roleLabel}.\n\nAccept your invitation: ${link}\n\nThis link is private and works for ${INVITE_VALID_DAYS} days. If you weren't expecting it, you can ignore this email.`,
    html: `<p>${inviterName} invited you to join <strong>${companyName}</strong> on Jindjinni as <strong>${roleLabel}</strong>.</p><p><a href="${link}">Accept your invitation</a></p><p style="color:#64748b;font-size:13px">This link is private and works for ${INVITE_VALID_DAYS} days. If you weren't expecting it, you can ignore this email.</p>`,
  });
}

/** An email may belong to only one company for now (there is no company switcher yet). */
async function activeMembershipElsewhere(email: string, organizationId: string) {
  const [row] = await db
    .select({ organizationId: memberships.organizationId })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, email), isNull(memberships.deactivatedAt), ne(memberships.organizationId, organizationId)))
    .limit(1);
  return !!row;
}

export async function createInvitation(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const org = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!isRole(role) || !ASSIGNABLE_ROLES.includes(role)) return { error: "Choose a role for this person." };
  if (role === "admin" && org.role !== "owner") return { error: "Only the owner can invite another admin." };

  // Already on this team?
  const [already] = await db
    .select({ id: memberships.id, deactivatedAt: memberships.deactivatedAt })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, email), eq(memberships.organizationId, org.organizationId)))
    .limit(1);
  if (already && !already.deactivatedAt) return { error: "That person is already on your team." };
  if (already?.deactivatedAt) return { error: "That person's access was switched off. Turn it back on from the team list instead of inviting them again." };
  if (await activeMembershipElsewhere(email, org.organizationId)) {
    return { error: "That email already belongs to a different company's workspace, so it can't be invited here. Ask them for a different email address." };
  }

  // Replace any earlier still-open invite to the same address instead of stacking them.
  const now = new Date().toISOString();
  const [earlier] = await db
    .select({ id: teamInvitations.id })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.organizationId, org.organizationId),
        eq(teamInvitations.email, email),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
      ),
    )
    .limit(1);
  if (earlier) await db.update(teamInvitations).set({ revokedAt: now }).where(eq(teamInvitations.id, earlier.id));

  const seats = await getSeatUsage(org.organizationId);
  if (seats.full) {
    // Put the earlier invite back -- nothing changed.
    if (earlier) await db.update(teamInvitations).set({ revokedAt: null }).where(eq(teamInvitations.id, earlier.id));
    return { error: `Your team is full (${seats.used} of ${seats.limit} seats used, counting pending invitations). Remove someone or cancel a pending invitation, or contact us to raise your limit.` };
  }

  const { token, tokenHash, expiresAt } = newInviteToken();
  const id = newId("tinv");
  await db.insert(teamInvitations).values({
    id,
    organizationId: org.organizationId,
    email,
    role: role as Exclude<Role, "owner" | "staff">,
    tokenHash,
    invitedByUserId: org.userId,
    expiresAt,
    lastSentAt: now,
  });
  await audit(org, id, "invitation", null, `${email} as ${ROLE_LABELS[role]}`, "Invitation created");

  const link = `${await originFromRequest()}/invite/${token}`;
  const [inviter] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  const sent = await emailInvite({
    to: email,
    companyName: org.organizationName,
    roleLabel: ROLE_LABELS[role],
    inviterName: inviter?.name || inviter?.email || "Your colleague",
    link,
  });

  return {
    message: sent.ok
      ? `Invitation emailed to ${email}. You can also copy the link below and send it yourself.`
      : `Invitation created for ${email}, but the email couldn't be sent. Copy the link below and send it to them yourself.`,
    inviteLink: link,
    emailed: sent.ok,
    inviteEmail: email,
  };
}

/** Gives a pending (or expired) invitation a fresh link and another 7 days. */
export async function resendInvitation(invitationId: string, _prev: TeamActionState, _formData: FormData): Promise<TeamActionState> {
  const org = await requireAdmin();
  const [inv] = await db
    .select()
    .from(teamInvitations)
    .where(and(eq(teamInvitations.id, invitationId), eq(teamInvitations.organizationId, org.organizationId)))
    .limit(1);
  if (!inv || inv.acceptedAt || inv.revokedAt) return { error: "That invitation is no longer open." };

  const expired = new Date(inv.expiresAt).getTime() <= Date.now();
  if (expired) {
    const seats = await getSeatUsage(org.organizationId);
    if (seats.full) return { error: `Your team is full (${seats.used} of ${seats.limit} seats), so an expired invitation can't be reopened.` };
  }

  const { token, tokenHash, expiresAt } = newInviteToken();
  await db
    .update(teamInvitations)
    .set({ tokenHash, expiresAt, lastSentAt: new Date().toISOString() })
    .where(eq(teamInvitations.id, inv.id));

  const link = `${await originFromRequest()}/invite/${token}`;
  const [inviter] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  const sent = await emailInvite({
    to: inv.email,
    companyName: org.organizationName,
    roleLabel: ROLE_LABELS[inv.role],
    inviterName: inviter?.name || inviter?.email || "Your colleague",
    link,
  });
  return {
    message: sent.ok ? `New link emailed to ${inv.email}.` : `New link ready, but the email couldn't be sent. Copy it and send it yourself.`,
    inviteLink: link,
    emailed: sent.ok,
    inviteEmail: inv.email,
  };
}

export async function revokeInvitation(invitationId: string, _prev: TeamActionState, _formData: FormData): Promise<TeamActionState> {
  const org = await requireAdmin();
  const [inv] = await db
    .select()
    .from(teamInvitations)
    .where(and(eq(teamInvitations.id, invitationId), eq(teamInvitations.organizationId, org.organizationId)))
    .limit(1);
  if (!inv || inv.acceptedAt || inv.revokedAt) return { error: "That invitation is no longer open." };
  await db.update(teamInvitations).set({ revokedAt: new Date().toISOString() }).where(eq(teamInvitations.id, inv.id));
  await audit(org, inv.id, "invitation", `${inv.email} as ${ROLE_LABELS[inv.role]}`, null, "Invitation cancelled");
  return { message: `Invitation to ${inv.email} cancelled.` };
}

async function loadTargetMember(org: CurrentOrg, membershipId: string) {
  const [m] = await db
    .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, deactivatedAt: memberships.deactivatedAt, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, org.organizationId)))
    .limit(1);
  return m ?? null;
}

/** Shared guard for changing or switching off someone: never yourself, never the owner, and only the owner touches admins. */
function cannotManage(org: CurrentOrg, target: { userId: string; role: string }): string | null {
  if (target.userId === org.userId) return "You can't change your own access. Ask another admin.";
  if (target.role === "owner") return "The owner's access can't be changed.";
  if (target.role === "admin" && org.role !== "owner") return "Only the owner can change an admin.";
  return null;
}

export async function changeMemberRole(membershipId: string, _prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const org = await requireAdmin();
  const target = await loadTargetMember(org, membershipId);
  if (!target) return { error: "Team member not found." };
  const blocked = cannotManage(org, target);
  if (blocked) return { error: blocked };

  const role = String(formData.get("role") ?? "");
  if (!isRole(role) || !ASSIGNABLE_ROLES.includes(role)) return { error: "Choose a valid role." };
  if (role === "admin" && org.role !== "owner") return { error: "Only the owner can make someone an admin." };
  if (role === target.role) return { message: "Role unchanged." };

  await db.update(memberships).set({ role: role as Exclude<Role, "owner"> }).where(eq(memberships.id, target.id));
  await audit(org, target.id, "role", target.role, role, `Role changed for ${target.email}`);
  return { message: `${target.email} is now ${ROLE_LABELS[role]}.` };
}

export async function setMemberActive(membershipId: string, active: boolean, _prev: TeamActionState, _formData: FormData): Promise<TeamActionState> {
  const org = await requireAdmin();
  const target = await loadTargetMember(org, membershipId);
  if (!target) return { error: "Team member not found." };
  const blocked = cannotManage(org, target);
  if (blocked) return { error: blocked };

  if (active) {
    if (!target.deactivatedAt) return { message: "Already active." };
    const seats = await getSeatUsage(org.organizationId);
    if (seats.full) return { error: `Your team is full (${seats.used} of ${seats.limit} seats). Free up a seat first.` };
    await db.update(memberships).set({ deactivatedAt: null }).where(eq(memberships.id, target.id));
    await audit(org, target.id, "access", "off", "on", `Access restored for ${target.email}`);
    return { message: `${target.email} can sign in again.` };
  }
  if (target.deactivatedAt) return { message: "Already switched off." };
  await db.update(memberships).set({ deactivatedAt: new Date().toISOString() }).where(eq(memberships.id, target.id));
  await audit(org, target.id, "access", "on", "off", `Access switched off for ${target.email}`);
  return { message: `${target.email} can no longer sign in to your workspace.` };
}

/**
 * Public (no admin needed): the person opens their invite link and accepts.
 *  - Already signed in as the invited email -> just joins.
 *  - Account exists for that email but they're signed out -> must sign in first.
 *  - No account -> creates one (name + password) and joins.
 * The invite email can't be changed, so a link only ever creates/uses the
 * account for the address it was sent to.
 */
export async function acceptInvitation(token: string, _prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const found = await lookupInvitation(token);
  if (found.status === "invalid") return { error: "This invitation link isn't valid." };
  if (found.status === "used") return { error: "This invitation was already used. Try signing in." };
  if (found.status === "revoked") return { error: "This invitation was cancelled. Ask your admin for a new one." };
  if (found.status === "expired") return { error: "This invitation has expired. Ask your admin to resend it." };
  const { invitation } = found;

  const [existingUser] = await db.select().from(users).where(eq(users.email, invitation.email)).limit(1);
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;

  if (await activeMembershipElsewhere(invitation.email, invitation.organizationId)) {
    return { error: "This email already belongs to a different company's workspace, so it can't join this one. Ask for an invitation to a different email address." };
  }

  const seats = await getSeatUsage(invitation.organizationId);
  // This invite itself counts as one pending seat, so accepting never needs a new one --
  // only refuse if the cap was lowered below current membership since.
  if (!seats.unlimited && seats.members >= seats.limit) {
    return { error: "This team has reached its member limit, so the invitation can't be accepted right now. Ask your admin." };
  }

  let userId: string;
  let needsSignIn = false;
  let password = "";

  if (existingUser) {
    if (sessionUserId !== existingUser.id) {
      return { error: `An account already exists for ${invitation.email}. Sign in with that account, then open this invitation link again.` };
    }
    userId = existingUser.id;
  } else {
    const name = String(formData.get("name") ?? "").trim();
    password = String(formData.get("password") ?? "");
    if (!name) return { error: "Enter your name." };
    if (password.length < 8) return { error: "Choose a password of at least 8 characters." };
    userId = newId("user");
    await db.insert(users).values({
      id: userId,
      email: invitation.email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      emailVerified: new Date().toISOString(),
    });
    needsSignIn = true;
  }

  // Join (or re-activate) this company.
  const [existingMembership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, invitation.organizationId)))
    .limit(1);
  if (existingMembership) {
    await db
      .update(memberships)
      .set({ deactivatedAt: null, role: invitation.role })
      .where(eq(memberships.id, existingMembership.id));
  } else {
    await db.insert(memberships).values({
      id: newId("mem"),
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role,
    });
  }
  await db.update(teamInvitations).set({ acceptedAt: new Date().toISOString() }).where(eq(teamInvitations.id, invitation.id));
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: invitation.organizationId,
    userId,
    recordType: "team",
    recordId: invitation.id,
    fieldName: "invitation",
    previousValue: null,
    newValue: `${invitation.email} as ${ROLE_LABELS[invitation.role]}`,
    note: "Invitation accepted",
  });

  if (needsSignIn) {
    try {
      await signIn("credentials", { email: invitation.email, password, redirect: false });
    } catch {
      redirect("/login");
    }
  }
  redirect("/dashboard");
}

/** Used by the Admin page to read the company name for display without exposing other tenants. */
export async function getOrganizationName(organizationId: string) {
  const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return o?.name ?? "";
}
