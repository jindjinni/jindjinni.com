// The affiliate portal and the owner's follow-up email -- the database side. Rules and wording are in affiliate-portal-rules.ts and
// affiliate-emails.ts. An affiliate signs in with an emailed one-time link (no password) and sees only the few things the rules allow.
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { affiliateEmails, affiliateLogins, affiliates } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/password-reset";
import { emailCheck } from "@/lib/password-reset-rules";
import {
  AFFILIATE_COOKIE, hashLoginToken, loginCooldownOver, loginStatus, loginUrl, looksLikeLoginToken, newLoginToken, portalReferrals,
  type LoginStatus, type PortalReferral,
} from "@/lib/affiliate-portal-rules";
import { affiliateDetailsEmail, affiliateLoginEmail } from "@/lib/affiliate-emails";
import { readAffiliateSession } from "@/lib/affiliate-session";
import { affiliateLink, referralRows } from "@/lib/pricing-service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Sends the portal sign-in link when this email belongs to an APPROVED, active affiliate. Says nothing about whether it did (the caller
 * shows the same answer either way). Only the newest link works.
 */
export async function requestAffiliateSignin(rawEmail: string): Promise<void> {
  const email = String(rawEmail ?? "").toLowerCase().trim();
  if (!emailCheck(email).ok) return;
  const [aff] = await db.select({ id: affiliates.id, email: affiliates.email }).from(affiliates).where(and(eq(affiliates.email, email), eq(affiliates.status, "active"))).limit(1);
  if (!aff) return;

  const now = Date.now();
  const [latest] = await db.select({ createdAt: affiliateLogins.createdAt }).from(affiliateLogins).where(eq(affiliateLogins.affiliateId, aff.id)).orderBy(desc(affiliateLogins.createdAt)).limit(1);
  if (!loginCooldownOver(latest?.createdAt, now)) return;

  const { token, tokenHash, expiresAt } = newLoginToken(now);
  const id = newId("afl");
  const stamp = new Date(now).toISOString();
  await db.insert(affiliateLogins).values({ id, affiliateId: aff.id, tokenHash, expiresAt, createdAt: stamp, updatedAt: stamp });

  const mail = affiliateLoginEmail(loginUrl(appUrl(), token));
  const sent = await sendEmail({ to: aff.email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!sent.ok) {
    console.error("[affiliate-portal] sign-in email not sent:", sent.error);
    await db.update(affiliateLogins).set({ usedAt: stamp, updatedAt: stamp }).where(eq(affiliateLogins.id, id));
    return;
  }
  await db.update(affiliateLogins).set({ usedAt: stamp, updatedAt: stamp }).where(and(eq(affiliateLogins.affiliateId, aff.id), isNull(affiliateLogins.usedAt), ne(affiliateLogins.id, id)));
}

/** Is this link still good? (Only checks; signing in is completeAffiliateSignin.) */
export async function lookupLoginToken(token: string): Promise<{ status: LoginStatus }> {
  if (!looksLikeLoginToken(token)) return { status: "invalid" };
  const [row] = await db.select({ expiresAt: affiliateLogins.expiresAt, usedAt: affiliateLogins.usedAt }).from(affiliateLogins).where(eq(affiliateLogins.tokenHash, hashLoginToken(token))).limit(1);
  return { status: loginStatus(row, Date.now()) };
}

/** Spends the link (one conditional update, so two clicks can't both use it) and returns who it was for, when that person is still an active affiliate. */
export async function completeAffiliateSignin(token: string): Promise<{ ok: true; affiliateId: string } | { ok: false; status: Exclude<LoginStatus, "valid"> }> {
  if (!looksLikeLoginToken(token)) return { ok: false, status: "invalid" };
  const tokenHash = hashLoginToken(token);
  const stamp = new Date().toISOString();
  const claimed = await db
    .update(affiliateLogins)
    .set({ usedAt: stamp, updatedAt: stamp })
    .where(and(eq(affiliateLogins.tokenHash, tokenHash), isNull(affiliateLogins.usedAt), gt(affiliateLogins.expiresAt, stamp)))
    .returning({ affiliateId: affiliateLogins.affiliateId });
  if (claimed.length === 0) {
    const [row] = await db.select({ expiresAt: affiliateLogins.expiresAt, usedAt: affiliateLogins.usedAt }).from(affiliateLogins).where(eq(affiliateLogins.tokenHash, tokenHash)).limit(1);
    const status = loginStatus(row, Date.now());
    return { ok: false, status: status === "valid" ? "used" : status };
  }
  const affiliateId = claimed[0].affiliateId;
  const [aff] = await db.select({ status: affiliates.status }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  if (!aff || aff.status !== "active") return { ok: false, status: "invalid" };
  return { ok: true, affiliateId };
}

export type PortalAffiliate = { id: string; name: string; email: string; code: string | null; link: string | null };

/** The signed-in affiliate (from the signed cookie), only while they are still approved and active; otherwise null. */
export async function currentAffiliate(): Promise<PortalAffiliate | null> {
  const raw = (await cookies()).get(AFFILIATE_COOKIE)?.value;
  const session = readAffiliateSession(raw);
  if (!session) return null;
  const [a] = await db.select().from(affiliates).where(eq(affiliates.id, session.a)).limit(1);
  if (!a || a.status !== "active") return null;
  return { id: a.id, name: a.name, email: a.email, code: a.code, link: a.code ? affiliateLink(a.code) : null };
}

/** The companies this affiliate may see: only those still working toward their 3 months (or qualified and awaiting payout). */
export async function portalFor(affiliateId: string): Promise<PortalReferral[]> {
  const rows = await referralRows(affiliateId);
  return portalReferrals(rows);
}

// ---- the owner's "details" email ---------------------------------------------------------------------------------------------

export function detailsEmailFor(a: { name: string; code: string | null }) {
  return affiliateDetailsEmail({ name: a.name, code: a.code, link: a.code ? affiliateLink(a.code) : null, portalUrl: `${appUrl()}/affiliate`, termsUrl: `${appUrl()}/terms` });
}

/** When each affiliate was last sent the details email (newest first per person). */
export async function detailsSentMap(): Promise<Map<string, string>> {
  const rows = await db.select({ affiliateId: affiliateEmails.affiliateId, createdAt: affiliateEmails.createdAt }).from(affiliateEmails).where(eq(affiliateEmails.kind, "details")).orderBy(desc(affiliateEmails.createdAt));
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.affiliateId)) m.set(r.affiliateId, r.createdAt);
  return m;
}

/** The owner pressed Send: email the affiliate the full details and keep the exact words. Only for an approved affiliate. */
export async function sendAffiliateDetails(by: { userId: string }, id: string): Promise<Result<{ to: string }>> {
  const [a] = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  if (!a) return { ok: false, error: "That affiliate was not found." };
  if (a.status !== "active" || !a.code) return { ok: false, error: "Approve them first. The details email carries their code and link." };
  const mail = detailsEmailFor(a);
  const sent = await sendEmail({ to: a.email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!sent.ok) return { ok: false, error: "The email could not be sent. Nothing was recorded. Try again, or send them the details yourself." };
  await db.insert(affiliateEmails).values({ id: newId("afe"), affiliateId: a.id, kind: "details", toEmail: a.email, subject: mail.subject, body: mail.text, sentBy: by.userId });
  return { ok: true, to: a.email };
}
