// The connection between a company's OWN website and its storefront (Settings -> Storefront -> Connect your website): the keys, the
// website addresses a browser form may call from, and how the website's data is read. Pure rules (no database), so they can be tested.
//
// In plain words: the company makes a key. A SECRET key (jjsk_...) stays on the website's server and may send requests and read their
// status. A PUBLIC key (jjpk_...) may sit in a web page's code; it can only send a new request or application, and only from the website
// addresses the company lists. Only a hash of each key is kept; the key itself is shown once. Nothing a website sends can choose the
// company, a price, a stock level or a status: the company comes from the key.

import { createHash, randomBytes } from "crypto";
import { linkCount, type SellRequestInput } from "@/lib/storefront-rules";
import type { RequestStatus } from "@/lib/storefront-rules";

export const API_VERSION = "v1";
export const KEY_KINDS = ["secret", "public"] as const;
export type KeyKind = (typeof KEY_KINDS)[number];
export const KEY_LABEL_MAX = 60;
/** A company can have this many working keys of each kind at a time (turn one off to make another). */
export const MAX_KEYS_PER_KIND = 5;
export const MAX_ORIGINS = 10;
export const MAX_BODY_BYTES = 30_000;

/** How many tries the connection allows (per hour). A browser form is held to the same limits as the storefront's own forms. */
export const LIMITS = {
  publicSellPerIp: 10,
  publicApplyPerIp: 5,
  secretPerKey: 600,
  badKeyPerIp: 30,
} as const;

const PREFIX: Record<KeyKind, string> = { secret: "jjsk_", public: "jjpk_" };

/** Makes a key. `bytes` is for tests; real keys use 30 random bytes (240 bits). Returns the key (shown once), what to keep (hash, hint). */
export function newApiKey(kind: KeyKind, bytes: Buffer = randomBytes(30)): { key: string; hash: string; hint: string } {
  const key = PREFIX[kind] + bytes.toString("base64url");
  return { key, hash: hashApiKey(key), hint: hintOf(key) };
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const hintOf = (key: string) => `${key.slice(0, 9)}...${key.slice(-4)}`;
export const looksLikeApiKey = (v: unknown): v is string => typeof v === "string" && /^jj(sk|pk)_[A-Za-z0-9_-]{40}$/.test(v);
export const kindOfKey = (key: string): KeyKind => (key.startsWith("jjpk_") ? "public" : "secret");

/** The key out of an "Authorization: Bearer <key>" header, or null. */
export function bearerOf(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((header ?? "").trim());
  return m ? m[1] : null;
}

export function cleanKeyLabel(raw: unknown): { ok: true; label: string } | { ok: false; error: string } {
  const label = String(raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, KEY_LABEL_MAX);
  if (label.length < 2) return { ok: false, error: "Give the key a short name, so you can tell it from the others (for example: Main website)." };
  return { ok: true, label };
}

/** Which things each kind of key may do. A public key can only send a new request or application. */
export type ApiAction = "info" | "sell-request-create" | "sell-request-read" | "application-create";
export function mayDo(kind: KeyKind, action: ApiAction): boolean {
  if (kind === "secret") return true;
  return action === "info" || action === "sell-request-create" || action === "application-create";
}

// ---- allowed website addresses ---------------------------------------------------------------------------------------------------

/** Checks the list of website addresses a company types (one per line). Only the address itself: https://www.example.com (no path, no wildcard). */
export function cleanOrigins(text: unknown): { ok: true; origins: string[] } | { ok: false; error: string } {
  const parts = String(text ?? "").split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const raw of parts) {
    if (raw.length > 200) return { ok: false, error: "One of the website addresses is too long." };
    if (raw.includes("*")) return { ok: false, error: "Wildcards (*) are not allowed. List each website address on its own line." };
    let u: URL;
    try { u = new URL(raw); } catch { return { ok: false, error: `"${raw.slice(0, 60)}" is not a website address. Use the form https://www.example.com` }; }
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return { ok: false, error: `"${raw.slice(0, 60)}" must start with https:// (http:// is only allowed for localhost while you are testing).` };
    if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return { ok: false, error: `Use just the website address without a page or extras: ${u.origin}` };
    if (!local && !u.hostname.includes(".")) return { ok: false, error: `"${raw.slice(0, 60)}" is not a website address.` };
    if (!out.includes(u.origin)) out.push(u.origin);
  }
  if (out.length > MAX_ORIGINS) return { ok: false, error: `You can list up to ${MAX_ORIGINS} website addresses.` };
  return { ok: true, origins: out };
}

export const originsFromText = (text: string | null | undefined): string[] => {
  const r = cleanOrigins(text ?? "");
  return r.ok ? r.origins : [];
};

/** Is this browser's Origin header one of the listed addresses (exact match)? */
export const originAllowed = (origin: string | null | undefined, list: string[]) => !!origin && list.includes(origin);

// ---- what a website sends --------------------------------------------------------------------------------------------------------

const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

export const MAX_ITEMS = 100;
export type ApiItem = { name: string; quantity: number; ndc: string | null; expiration: string | null; note: string | null };

/** The product lines a website sends (a catalog page's "Recycle Now" choices): a name and a quantity each, optionally NDC, expiry and a note. */
export function cleanItems(raw: unknown): { ok: true; items: ApiItem[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "items must be a list." };
  if (raw.length > MAX_ITEMS) return { ok: false, error: `Send at most ${MAX_ITEMS} product lines. Put the rest in itemsText.` };
  const items: ApiItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown> | null;
    if (!r || typeof r !== "object") return { ok: false, error: `Product line ${i + 1} is not valid.` };
    const name = oneLine(r.name, 120);
    if (!name) return { ok: false, error: `Product line ${i + 1} needs a name.` };
    const q = Number(r.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 1_000_000) return { ok: false, error: `Product line ${i + 1} (${name.slice(0, 40)}) needs a whole-number quantity of 1 or more.` };
    const ndcRaw = oneLine(r.ndc, 20);
    if (ndcRaw && !/^[0-9-]{8,14}$/.test(ndcRaw)) return { ok: false, error: `Product line ${i + 1} has an NDC that does not look right (digits and dashes only).` };
    const exp = oneLine(r.expiration, 20);
    if (exp && !/^\d{4}-\d{2}(-\d{2})?$/.test(exp) && !/^\d{1,2}\/\d{2,4}$/.test(exp)) return { ok: false, error: `Product line ${i + 1} has an expiry date that does not look right. Use 2027-03 or 2027-03-31.` };
    items.push({ name, quantity: q, ndc: ndcRaw || null, expiration: exp || null, note: oneLine(r.note, 200) || null });
  }
  return { ok: true, items };
}

/** The product lines as plain text for the staff (one line each), the same shape as typed text. */
export function itemsToText(items: ApiItem[]): string {
  return items
    .map((i) => {
      const extra = [i.ndc ? `NDC ${i.ndc}` : "", i.expiration ? `exp ${i.expiration}` : "", i.note ?? ""].filter(Boolean).join(", ");
      return `${i.quantity} x ${i.name}${extra ? ` (${extra})` : ""}`;
    })
    .join("\n");
}

/** A sell request as a website sends it (JSON). Either `items` (a list) or `itemsText` (words), or both. `donation: true` marks it a donation. */
export function sellInputFromBody(body: Record<string, unknown>): { ok: true; input: SellRequestInput; isDonation: boolean } | { ok: false; error: string } {
  const items = cleanItems(body.items);
  if (!items.ok) return items;
  const text = [itemsToText(items.items), String(body.itemsText ?? "")].filter((t) => t.trim()).join("\n");
  const isDonation = body.donation === true || body.donation === "true";
  const notes = [isDonation ? "Marked as a DONATION by the sender." : "", String(body.notes ?? "")].filter((t) => t.trim()).join("\n");
  return {
    ok: true,
    isDonation,
    input: {
      businessName: body.businessName, contactName: body.contactName, email: body.email, phone: body.phone,
      street1: body.street1, street2: body.street2, city: body.city, state: body.state, zip: body.zip,
      itemsText: text, notes,
    },
  };
}

/** A request's status in the words a website sees. */
export const API_STATUS: Record<RequestStatus, string> = { NEW: "received", QUOTED: "quotation_made", DECLINED: "declined" };

export const REFERENCE_PATTERN = /^WEB-[A-HJ-NP-Z2-9]{6}$/;

export type ApiErrorCode =
  | "missing_key" | "invalid_key" | "secret_key_in_browser" | "origin_not_allowed" | "not_allowed_for_key" | "storefront_unavailable"
  | "not_open" | "invalid_request" | "not_found" | "rate_limited" | "daily_limit" | "too_large" | "server_error";

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  missing_key: 401, invalid_key: 401, secret_key_in_browser: 403, origin_not_allowed: 403, not_allowed_for_key: 403, storefront_unavailable: 404,
  not_open: 409, invalid_request: 422, not_found: 404, rate_limited: 429, daily_limit: 429, too_large: 413, server_error: 500,
};

/** Whether a text pile looks like link advertising is checked by the same cleaners as the storefront's own forms. Kept here so tests can use it. */
export const tooManyLinks = (...texts: string[]) => texts.reduce((n, t) => n + linkCount(t), 0) > 2;
