// Pharmacy accounts on a company's storefront -- the database side. Rules are in storefront-buyer-rules.ts, the words in
// storefront-buyer-emails.ts, the buttons in actions/storefront-buyers.ts (public) and actions/storefront.ts (staff).
//
// Public side (a visitor, no sign-in): apply, ask for a sign-in link, spend the link, read their own approved account. The company always
// comes from the storefront the page was opened on, never from the form. Staff side: every function takes the SIGNED-IN person's
// organizationId and filters by it.

import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { organizations, salesBuyers, storefrontBuyerLogins, storefrontBuyers, purchasingAuditLog } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendCustomerEmail } from "@/lib/email";
import { appUrl } from "@/lib/password-reset";
import { emailCheck } from "@/lib/password-reset-rules";
import { hashLoginToken, loginCooldownOver, loginStatus, looksLikeLoginToken, newLoginToken, type LoginStatus } from "@/lib/affiliate-portal-rules";
import { BUYER_COOKIE, MAX_APPLICATIONS_PER_DAY, mayUseAccount, nextBuyerStatus, type Application, type BuyerDecision, type BuyerStatus } from "@/lib/storefront-buyer-rules";
import { readBuyerSession } from "@/lib/storefront-buyer-session";
import { buyerApprovedEmail, buyerSigninEmail } from "@/lib/storefront-buyer-emails";
import type { PublicStorefront } from "@/lib/storefront-public";

export type BuyerRow = typeof storefrontBuyers.$inferSelect;

// ---- public side -------------------------------------------------------------------------------------------------------------

export type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Saves a pharmacy's application for this storefront's company. `app` has been checked and cleaned. Applying again with the same email
 * does not make a second record and says nothing about the earlier one (the visitor sees the same "received" answer), so this can't be
 * used to find out who has an account. A flood is turned away by a daily cap.
 */
export async function submitApplication(sf: PublicStorefront, app: Application): Promise<ApplyResult> {
  if (!sf.buyOpen) return { ok: false, error: "This company is not taking applications right now." };
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(storefrontBuyers).where(and(eq(storefrontBuyers.storefrontId, sf.storefrontId), gt(storefrontBuyers.createdAt, dayAgo)));
  if (Number(count?.n ?? 0) >= MAX_APPLICATIONS_PER_DAY) return { ok: false, error: "This company has received a lot of applications today. Please try again tomorrow." };
  const [same] = await db.select({ id: storefrontBuyers.id }).from(storefrontBuyers).where(and(eq(storefrontBuyers.storefrontId, sf.storefrontId), eq(storefrontBuyers.email, app.email))).limit(1);
  if (same) return { ok: true };
  try {
    await db.insert(storefrontBuyers).values({ id: newId("sfbuy"), organizationId: sf.organizationId, storefrontId: sf.storefrontId, status: "PENDING", ...app });
  } catch (err) {
    if (!String(err).toLowerCase().includes("unique")) throw err;
  }
  return { ok: true };
}

/** Sends the sign-in link when this email belongs to an APPROVED pharmacy of this storefront. Says nothing about whether it did. Only the newest link works. */
export async function requestBuyerSignin(sf: PublicStorefront, rawEmail: string): Promise<void> {
  const email = String(rawEmail ?? "").toLowerCase().trim();
  if (!emailCheck(email).ok || !sf.buyOpen) return;
  const [buyer] = await db.select().from(storefrontBuyers).where(and(eq(storefrontBuyers.storefrontId, sf.storefrontId), eq(storefrontBuyers.email, email))).limit(1);
  if (!buyer || buyer.hiddenAt || !mayUseAccount(buyer.status)) return;

  const now = Date.now();
  const [latest] = await db.select({ createdAt: storefrontBuyerLogins.createdAt }).from(storefrontBuyerLogins).where(eq(storefrontBuyerLogins.buyerId, buyer.id)).orderBy(desc(storefrontBuyerLogins.createdAt)).limit(1);
  if (!loginCooldownOver(latest?.createdAt, now)) return;

  const { token, tokenHash, expiresAt } = newLoginToken(now);
  const id = newId("sfbl");
  const stamp = new Date(now).toISOString();
  await db.insert(storefrontBuyerLogins).values({ id, buyerId: buyer.id, tokenHash, expiresAt, createdAt: stamp, updatedAt: stamp });
  const mail = buyerSigninEmail(sf.displayName, `${appUrl().replace(/\/$/, "")}/s/${sf.handle}/signin/${token}`);
  const sent = await sendCustomerEmail({ to: buyer.email, subject: mail.subject, text: mail.text, html: mail.html, fromName: sf.displayName });
  if (!sent.ok) {
    console.error("[storefront-buyers] sign-in email not sent:", sent.error);
    await db.update(storefrontBuyerLogins).set({ usedAt: stamp, updatedAt: stamp }).where(eq(storefrontBuyerLogins.id, id));
    return;
  }
  await db.update(storefrontBuyerLogins).set({ usedAt: stamp, updatedAt: stamp }).where(and(eq(storefrontBuyerLogins.buyerId, buyer.id), isNull(storefrontBuyerLogins.usedAt), ne(storefrontBuyerLogins.id, id)));
}

/** Is this link still good, and was it made for a pharmacy of THIS storefront? (Only checks.) */
export async function lookupBuyerToken(sf: PublicStorefront, token: string): Promise<{ status: LoginStatus }> {
  if (!looksLikeLoginToken(token)) return { status: "invalid" };
  const [row] = await db
    .select({ expiresAt: storefrontBuyerLogins.expiresAt, usedAt: storefrontBuyerLogins.usedAt, storefrontId: storefrontBuyers.storefrontId })
    .from(storefrontBuyerLogins)
    .innerJoin(storefrontBuyers, eq(storefrontBuyerLogins.buyerId, storefrontBuyers.id))
    .where(eq(storefrontBuyerLogins.tokenHash, hashLoginToken(token)))
    .limit(1);
  if (!row || row.storefrontId !== sf.storefrontId) return { status: "invalid" };
  return { status: loginStatus(row, Date.now()) };
}

/** Spends the link (one conditional update, so two clicks can't both use it) and returns the pharmacy, when it is approved and belongs to this storefront. */
export async function completeBuyerSignin(sf: PublicStorefront, token: string): Promise<{ ok: true; buyerId: string } | { ok: false; status: Exclude<LoginStatus, "valid"> }> {
  const looked = await lookupBuyerToken(sf, token);
  if (looked.status === "invalid") return { ok: false, status: "invalid" };
  const tokenHash = hashLoginToken(token);
  const stamp = new Date().toISOString();
  const claimed = await db
    .update(storefrontBuyerLogins)
    .set({ usedAt: stamp, updatedAt: stamp })
    .where(and(eq(storefrontBuyerLogins.tokenHash, tokenHash), isNull(storefrontBuyerLogins.usedAt), gt(storefrontBuyerLogins.expiresAt, stamp)))
    .returning({ buyerId: storefrontBuyerLogins.buyerId });
  if (claimed.length === 0) return { ok: false, status: looked.status === "valid" ? "used" : looked.status };
  const [b] = await db.select({ status: storefrontBuyers.status }).from(storefrontBuyers).where(and(eq(storefrontBuyers.id, claimed[0].buyerId), eq(storefrontBuyers.storefrontId, sf.storefrontId))).limit(1);
  if (!b || !mayUseAccount(b.status)) return { ok: false, status: "invalid" };
  return { ok: true, buyerId: claimed[0].buyerId };
}

export type SignedInBuyer = { id: string; businessName: string; contactName: string; email: string };

/** The signed-in pharmacy for THIS storefront, only while the account is approved (the cookie alone is never enough); otherwise null. */
export async function currentBuyer(sf: PublicStorefront): Promise<SignedInBuyer | null> {
  const session = readBuyerSession((await cookies()).get(BUYER_COOKIE)?.value);
  if (!session || session.s !== sf.storefrontId) return null;
  const [b] = await db.select().from(storefrontBuyers).where(and(eq(storefrontBuyers.id, session.b), eq(storefrontBuyers.storefrontId, sf.storefrontId))).limit(1);
  if (!b || b.hiddenAt || !mayUseAccount(b.status) || !sf.buyOpen) return null;
  return { id: b.id, businessName: b.businessName, contactName: b.contactName, email: b.email };
}

// ---- staff side --------------------------------------------------------------------------------------------------------------

export async function listBuyerAccounts(organizationId: string, includeHidden: boolean): Promise<BuyerRow[]> {
  return db
    .select()
    .from(storefrontBuyers)
    .where(includeHidden ? eq(storefrontBuyers.organizationId, organizationId) : and(eq(storefrontBuyers.organizationId, organizationId), isNull(storefrontBuyers.hiddenAt)))
    .orderBy(desc(storefrontBuyers.createdAt))
    .limit(500);
}

export async function pendingBuyerCount(organizationId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(storefrontBuyers).where(and(eq(storefrontBuyers.organizationId, organizationId), eq(storefrontBuyers.status, "PENDING"), isNull(storefrontBuyers.hiddenAt)));
  return Number(r?.n ?? 0);
}

async function audit(organizationId: string, userId: string, id: string, field: string, from: string | null, to: string | null, note?: string) {
  await db.insert(purchasingAuditLog).values({ id: newId("paudit"), organizationId, userId, recordType: "storefront_buyer", recordId: id, fieldName: field, previousValue: from, newValue: to, note: note ?? null });
}

export type DecideResult = { ok: true; emailed?: boolean } | { ok: false; error: string };

/** Puts the pharmacy in the company's Sales buyers (reusing one with the same email or NPI) and returns its id. The NCPDP number is never asked for here: only a PBM audit needs it. */
async function linkSalesBuyer(organizationId: string, b: BuyerRow): Promise<string> {
  const rows = await db.select({ id: salesBuyers.id, email: salesBuyers.email, npi: salesBuyers.npi }).from(salesBuyers).where(eq(salesBuyers.organizationId, organizationId));
  const hit = rows.find((r) => (r.email && r.email.toLowerCase() === b.email) || (r.npi && r.npi === b.npi));
  if (hit) return hit.id;
  const id = newId("sbuyer");
  const address = [b.street1, b.street2, `${b.city}, ${b.state} ${b.zip}`].filter(Boolean).join(", ");
  await db.insert(salesBuyers).values({
    id, organizationId, companyName: b.businessName, contactName: b.contactName, email: b.email, phone: b.phone, billingAddress: address, shippingAddress: address,
    npi: b.npi, defaultNotes: `From the website. DEA ${b.deaNumber}. State license ${b.licenseNumber} (${b.licenseState}).`,
  });
  return id;
}

/**
 * Approve, decline, suspend or reactivate an account. The state change is claimed with one conditional update (so two people clicking can't
 * both win). Approving also adds the pharmacy to Sales buyers and emails them that they can sign in; the email is best effort and its result
 * is returned, never blocking the approval. Suspending takes effect on the pharmacy's next visit (the cookie is re-checked every time).
 */
export async function decideBuyer(organizationId: string, userId: string, id: string, decision: BuyerDecision, company: { name: string; handle: string }): Promise<DecideResult> {
  const [b] = await db.select().from(storefrontBuyers).where(and(eq(storefrontBuyers.id, id), eq(storefrontBuyers.organizationId, organizationId))).limit(1);
  if (!b) return { ok: false, error: "Account not found." };
  const to = nextBuyerStatus(b.status as BuyerStatus, decision);
  if (!to) return { ok: false, error: "That can't be done to this account right now." };
  const now = new Date().toISOString();
  const claim = await db
    .update(storefrontBuyers)
    .set({ status: to, decidedByUserId: userId, decidedAt: now, updatedAt: now })
    .where(and(eq(storefrontBuyers.id, id), eq(storefrontBuyers.organizationId, organizationId), eq(storefrontBuyers.status, b.status)));
  if (claim.rowsAffected === 0) return { ok: false, error: "Someone else just handled this account." };
  await audit(organizationId, userId, id, "status", b.status, to);

  let emailed: boolean | undefined;
  if (decision === "approve") {
    try {
      const salesBuyerId = await linkSalesBuyer(organizationId, b);
      await db.update(storefrontBuyers).set({ salesBuyerId }).where(and(eq(storefrontBuyers.id, id), eq(storefrontBuyers.organizationId, organizationId)));
      const mail = buyerApprovedEmail({ company: company.name, contactName: b.contactName, pharmacy: b.businessName, accountUrl: `${appUrl().replace(/\/$/, "")}/s/${company.handle}/account` });
      const [org] = await db.select({ replyTo: organizations.shipFromEmail }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      const sent = await sendCustomerEmail({ to: b.email, subject: mail.subject, text: mail.text, html: mail.html, fromName: company.name, replyTo: org?.replyTo ?? null });
      emailed = sent.ok;
      if (!sent.ok) console.error("[storefront-buyers] approval email not sent:", sent.error);
    } catch (err) {
      console.error("[storefront-buyers] after approving:", err);
      emailed = false;
    }
  }
  return { ok: true, emailed };
}

export async function setBuyerHidden(organizationId: string, userId: string, id: string, hidden: boolean): Promise<{ ok: boolean }> {
  const now = new Date().toISOString();
  const res = await db.update(storefrontBuyers).set({ hiddenAt: hidden ? now : null, updatedAt: now }).where(and(eq(storefrontBuyers.id, id), eq(storefrontBuyers.organizationId, organizationId)));
  if (res.rowsAffected === 0) return { ok: false };
  await audit(organizationId, userId, id, "hidden", hidden ? "no" : "yes", hidden ? "yes" : "no");
  return { ok: true };
}
