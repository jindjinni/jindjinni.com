// "Are you a human?" for the public forms (sign-in, sign-up, invitations, emailed codes). Three layers, all decided on the
// server (the form only carries the answers):
//   1. A hidden trap field that people never see but form-filling bots fill in.
//   2. Cloudflare Turnstile, a free human check that is usually invisible. It switches on when TURNSTILE_SITE_KEY and
//      TURNSTILE_SECRET_KEY are both set in Vercel; with no keys the site works as before.
//   3. A "too many tries" limit per network address (rate-limit.ts).
// If Cloudflare itself can't be reached we let the person through (it must never lock everyone out); a wrong answer is refused.

import { headers } from "next/headers";
import { rateCheck, rateHit, waitMessage } from "@/lib/rate-limit";

export const HONEYPOT_FIELD = "hp_company_url";
export const TURNSTILE_FIELD = "cf-turnstile-response";

export function humanCheckConfig(): { siteKey: string | null; secret: string | null; test: boolean } {
  const test = !!process.env.TURNSTILE_TEST_BASE;
  const siteKey = process.env.TURNSTILE_SITE_KEY || null;
  const secret = process.env.TURNSTILE_SECRET_KEY || null;
  return { siteKey: siteKey && secret ? siteKey : test ? "test" : null, secret: secret ?? (test ? "test" : null), test };
}

/** The visitor's network address as the hosting platform reports it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return h.get("x-real-ip")?.trim() || fwd || "unknown";
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const cfg = humanCheckConfig();
  if (!cfg.secret) return true;
  const base = process.env.TURNSTILE_TEST_BASE || "https://challenges.cloudflare.com";
  try {
    const res = await fetch(`${base}/turnstile/v0/siteverify`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: cfg.secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return true; // Cloudflare trouble: don't lock people out
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return true;
  }
}

export type Guard = {
  /** Short name of the form, for the counters (for example "signup"). */
  scope: string;
  /** Tries allowed per network address in the window; every try counts. Leave out to only peek (see `countOnlyFailures`). */
  max: number;
  windowSec: number;
  /** Skip the human check (for example a form that is already behind a sign-in). */
  skipHuman?: boolean;
};

/**
 * Run first in a public form's server action. Returns an error message to show, or null to carry on. The trap field gets the
 * same plain message as a failed check, so a bot learns nothing about which layer stopped it.
 */
export async function guardPublicForm(fd: FormData, g: Guard): Promise<string | null> {
  const ip = await clientIp();
  const trap = String(fd.get(HONEYPOT_FIELD) ?? "");
  const wait = await rateHit(g.scope, ip, g.max, g.windowSec);
  if (!wait.allowed) return waitMessage(wait.retryAfterSec);
  if (trap) return "We couldn't confirm you're a person. Please reload the page and try again.";
  if (!g.skipHuman && humanCheckConfig().secret) {
    const token = String(fd.get(TURNSTILE_FIELD) ?? "");
    if (!token) return "Please wait a moment for the human check to finish, then try again.";
    if (!(await verifyTurnstile(token, ip))) return "We couldn't confirm you're a person. Please reload the page and try again.";
  }
  return null;
}

/** For sign-in: the human check and the trap, plus a limit that counts only WRONG passwords (so a busy office isn't slowed down). */
export async function guardLogin(fd: FormData): Promise<{ error: string | null; ip: string }> {
  const ip = await clientIp();
  const blocked = await rateCheck("login-fail", ip, 30, 15 * 60);
  if (!blocked.allowed) return { error: waitMessage(blocked.retryAfterSec), ip };
  if (String(fd.get(HONEYPOT_FIELD) ?? "")) return { error: "We couldn't confirm you're a person. Please reload the page and try again.", ip };
  if (humanCheckConfig().secret) {
    const token = String(fd.get(TURNSTILE_FIELD) ?? "");
    if (!token) return { error: "Please wait a moment for the human check to finish, then try again.", ip };
    if (!(await verifyTurnstile(token, ip))) return { error: "We couldn't confirm you're a person. Please reload the page and try again.", ip };
  }
  return { error: null, ip };
}

/** Count one wrong password against this network address. */
export async function noteFailedLogin(ip: string): Promise<void> {
  await rateHit("login-fail", ip, 30, 15 * 60);
}
