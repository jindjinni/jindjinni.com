// Staff logins an admin creates for people who have no email of their own: a
// username tied to the company ("maria_acme-supplies") and a generated password.
// Pure helpers here; the actions are in src/app/actions/team.ts.
import { randomInt } from "crypto";

/** Staff accounts have no real mailbox; this address can never receive mail (".invalid" is reserved). */
export const STAFF_EMAIL_DOMAIN = "staff.invalid";

export function staffEmailFor(username: string): string {
  return `${username}@${STAFF_EMAIL_DOMAIN}`;
}

export function isStaffEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`);
}

/** What the person types before the company part: lowercase letters, digits, dots and hyphens, 2-30 characters. Returns "" if nothing usable is left. */
export function cleanLoginName(input: string): string {
  const lowered = input.trim().toLowerCase().replace(/\s+/g, ".");
  const cleaned = lowered.replace(/[^a-z0-9.-]/g, "").replace(/^[.-]+|[.-]+$/g, "").replace(/\.{2,}/g, ".");
  return cleaned.slice(0, 30);
}

/** The full username: "<login name>_<company slug>". */
export function buildUsername(loginName: string, orgSlug: string): string {
  return `${loginName}_${orgSlug.toLowerCase()}`;
}

/** Whether what was typed on the sign-in form is a username (no "@") rather than an email address. */
export function looksLikeUsername(identifier: string): boolean {
  return !identifier.includes("@");
}

// No 0/O, 1/l/I: easy to read out loud or copy from a text message.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 12;

/** A random password for a new staff login (shown to the admin once, then only a hash is kept). */
export function generatePassword(): string {
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

/** Shown on the sign-in screens and anywhere a person's sign-in name is displayed. */
export function loginLabel(user: { email: string; username?: string | null }): string {
  return user.username || user.email;
}
