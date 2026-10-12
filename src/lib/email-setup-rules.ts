// "Company emails" setup page: the plain rules (pure). Which departments a company needs an address for, what to suggest in
// each box (on the company's own web address), and whether what was typed is acceptable.

import { isEmail } from "@/lib/audit-email";
import type { MailDept } from "@/lib/mail-rules";

/** Addresses on these services are personal mailboxes, not "the company's own": we warn (never block) so customers recognise the sender. */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
  "mac.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com", "comcast.net", "att.net", "verizon.net", "sbcglobal.net",
]);

/** Departments that send or receive mail for a company: the wholesale chain is four; a distribution workspace adds Sales and Shipping. */
export function emailDeptsFor(sides: { wholesale: boolean; distribution: boolean }): MailDept[] {
  const base: MailDept[] = ["purchasing", "receiving", "accounts", "customer-service"];
  return sides.distribution ? ["purchasing", "sales", "shipping", "receiving", "accounts", "customer-service"] : base;
}

/** The "name" part suggested for each department's address. */
export const SUGGESTED_LOCAL: Record<MailDept, string> = {
  purchasing: "purchasing",
  sales: "sales",
  shipping: "shipping",
  receiving: "receiving",
  accounts: "accounts",
  "customer-service": "support",
};

export const normalizeEmail = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/** The web address part of an email (after the @), or null. */
export function domainOf(email: string | null | undefined): string | null {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  return at > 0 && at < e.length - 3 ? e.slice(at + 1) : null;
}

/** The domain to suggest: the first of the given addresses that is on the company's own web address, else a neutral placeholder. */
export function companyDomain(emails: (string | null | undefined)[]): string | null {
  for (const e of emails) {
    const d = domainOf(e);
    if (d && !FREE_MAIL_DOMAINS.has(d)) return d;
  }
  return null;
}

export const PLACEHOLDER_DOMAIN = "yourcompany.com";
export const suggestedAddress = (dept: MailDept, domain: string | null): string => `${SUGGESTED_LOCAL[dept]}@${domain ?? PLACEHOLDER_DOMAIN}`;

export type AddressCheck = { ok: true; email: string; warning?: string } | { ok: false; error: string };

/** One typed address. `others` are the addresses typed for the other departments (one address can't be on two mailboxes). */
export function checkPlannedAddress(raw: unknown, domain: string | null, others: string[]): AddressCheck {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: "Enter an email address." };
  if (email.length > 200 || !isEmail(email)) return { ok: false, error: `"${String(raw).trim().slice(0, 60)}" isn't a full email address. It looks like name@yourcompany.com.` };
  if (others.map(normalizeEmail).includes(email)) return { ok: false, error: `${email} is already used for another department. Each department needs its own address.` };
  const d = domainOf(email)!;
  if (FREE_MAIL_DOMAINS.has(d)) {
    return { ok: true, email, warning: `${email} is a personal ${d} address. It works, but customers trust mail from your own company address (like ${SUGGESTED_LOCAL.purchasing}@${domain ?? PLACEHOLDER_DOMAIN}) more.` };
  }
  if (domain && d !== domain) return { ok: true, email, warning: `${email} is on ${d}, not ${domain}. That's fine if it's also your company's address.` };
  return { ok: true, email };
}
