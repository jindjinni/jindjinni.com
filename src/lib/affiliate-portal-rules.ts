// The affiliate portal's pure rules (no database, no email), so they can be tested on their own. The service that uses them is
// affiliate-portal.ts; the buttons are in actions/affiliate-portal.ts.
//
// How it works, in plain words: an approved affiliate types their email and we email a one-time link that works for 30 minutes (no
// passwords). Opening it signs them in for 7 days. The page always answers the same, so it can't be used to find out who is an affiliate.
//
// What an affiliate may see (decided by the platform owner): only the name of each company they referred, since when it has been active,
// how many of its first 3 billed months are done, and whether it has qualified. Once the payout for a company has been paid, that
// company disappears from their portal for good. Nothing else about a company (its plan, price, people, records) is ever shown.
import { AFFILIATE_MONTHS } from "@/lib/affiliate-program";
import { cooldownOver, hashResetToken, looksLikeResetToken, normalizeResetEmail, resetStatus, type ResetStatus } from "@/lib/password-reset-rules";
import { randomBytes } from "crypto";
import type { ReferralStatus } from "@/lib/pricing-rules";

export const LOGIN_VALID_MINUTES = 30;
export const LOGIN_COOLDOWN_SEC = 60;
export const SESSION_DAYS = 7;
export const AFFILIATE_COOKIE = "jj_affiliate";

export const normalizeAffiliateEmail = normalizeResetEmail;
export const hashLoginToken = hashResetToken;
export const looksLikeLoginToken = looksLikeResetToken;
export const loginCooldownOver = (last: string | null | undefined, nowMs: number) => cooldownOver(last, nowMs, LOGIN_COOLDOWN_SEC);
export type LoginStatus = ResetStatus;
export const loginStatus = resetStatus;

export function newLoginToken(nowMs: number): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashLoginToken(token), expiresAt: new Date(nowMs + LOGIN_VALID_MINUTES * 60000).toISOString() };
}

export const loginUrl = (base: string, token: string) => `${base.replace(/\/$/, "")}/affiliate/signin/${token}`;

export type PortalState = "waiting" | "qualified" | "ended";

/** The ONLY things an affiliate is shown about a company they referred. */
export type PortalReferral = {
  company: string;
  /** The day the company was approved and started on jindjinni, or null while it is still waiting for approval. */
  activeSince: string | null;
  monthsDone: number;
  monthsNeeded: number;
  state: PortalState;
  label: string;
  /** What this affiliate earns when it qualifies. */
  payoutCents: number;
};

export const PORTAL_LABEL: Record<PortalState, string> = {
  waiting: `Working toward ${AFFILIATE_MONTHS} months`,
  qualified: "Qualified. Your payout is on its way.",
  ended: `Ended before ${AFFILIATE_MONTHS} months. No payout.`,
};

type Source = { company: string; activeSince: string | null; monthsDone: number; status: ReferralStatus; cutCents: number | null };

/**
 * What the portal shows. A referral whose payout has been PAID is dropped completely. Each row is built field by field from the
 * allowed few, so nothing else a source row happens to carry can ever reach an affiliate.
 */
export function portalReferrals(rows: Source[]): PortalReferral[] {
  const out: PortalReferral[] = [];
  for (const r of rows) {
    if (r.status === "paid") continue;
    const state: PortalState = r.status === "owed" ? "qualified" : r.status === "void" ? "ended" : "waiting";
    out.push({
      company: r.company,
      activeSince: r.activeSince,
      monthsDone: state === "qualified" ? AFFILIATE_MONTHS : Math.max(0, Math.min(AFFILIATE_MONTHS, r.monthsDone)),
      monthsNeeded: AFFILIATE_MONTHS,
      state,
      label: PORTAL_LABEL[state],
      payoutCents: r.cutCents ?? 0,
    });
  }
  return out;
}
