// Service for the connection between a company's own website and its storefront: making and turning off keys, the allowed website
// addresses, looking a key up, and a request's status for the website to show its sender. Staff functions take the organizationId of the
// SIGNED-IN person; the key lookup resolves the company from the key itself (never from anything the website sends).

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, purchasingQuotations, storefrontApiKeys, storefronts, websiteRequests } from "@/db/schema";
import { newId } from "@/lib/ids";
import { API_STATUS, MAX_KEYS_PER_KIND, cleanKeyLabel, cleanOrigins, hashApiKey, looksLikeApiKey, newApiKey, type KeyKind } from "@/lib/storefront-api-rules";
import type { RequestStatus } from "@/lib/storefront-rules";

export type ApiKeyRow = typeof storefrontApiKeys.$inferSelect;

async function audit(organizationId: string, userId: string, recordId: string, field: string, from: string | null, to: string | null, note?: string) {
  await db.insert(purchasingAuditLog).values({ id: newId("paudit"), organizationId, userId, recordType: "storefront_api_key", recordId, fieldName: field, previousValue: from, newValue: to, note: note ?? null });
}

export async function listApiKeys(organizationId: string): Promise<ApiKeyRow[]> {
  return db.select().from(storefrontApiKeys).where(eq(storefrontApiKeys.organizationId, organizationId)).orderBy(desc(storefrontApiKeys.createdAt)).limit(100);
}

export type MadeKey = { ok: true; key: string; id: string } | { ok: false; error: string };

/** Makes a key for the company's storefront. The key is returned once and never kept; only its hash is. */
export async function createApiKey(organizationId: string, userId: string, storefrontId: string, kind: KeyKind, rawLabel: unknown): Promise<MadeKey> {
  const label = cleanKeyLabel(rawLabel);
  if (!label.ok) return label;
  const [sf] = await db.select({ id: storefronts.id }).from(storefronts).where(and(eq(storefronts.id, storefrontId), eq(storefronts.organizationId, organizationId))).limit(1);
  if (!sf) return { ok: false, error: "Set up your storefront first (name and web address), then make a key." };
  const [n] = await db
    .select({ n: sql<number>`count(*)` })
    .from(storefrontApiKeys)
    .where(and(eq(storefrontApiKeys.organizationId, organizationId), eq(storefrontApiKeys.kind, kind), isNull(storefrontApiKeys.revokedAt)));
  if (Number(n?.n ?? 0) >= MAX_KEYS_PER_KIND) return { ok: false, error: `You already have ${MAX_KEYS_PER_KIND} working ${kind} keys. Turn one off first.` };
  const made = newApiKey(kind);
  const id = newId("sfkey");
  await db.insert(storefrontApiKeys).values({ id, organizationId, storefrontId, kind, label: label.label, keyHash: made.hash, hint: made.hint, createdByUserId: userId });
  await audit(organizationId, userId, id, "created", null, `${kind} key "${label.label}"`);
  return { ok: true, key: made.key, id };
}

/** Turns a key off for good (it can't be turned back on; make a new one). The record stays. */
export async function revokeApiKey(organizationId: string, userId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const res = await db
    .update(storefrontApiKeys)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(storefrontApiKeys.id, id), eq(storefrontApiKeys.organizationId, organizationId), isNull(storefrontApiKeys.revokedAt)));
  if (res.rowsAffected === 0) return { ok: false, error: "That key was not found or is already off." };
  await audit(organizationId, userId, id, "revoked", "on", "off");
  return { ok: true };
}

/** Saves the website addresses a browser form (public key) may call from. */
export async function saveAllowedOrigins(organizationId: string, userId: string, text: unknown): Promise<{ ok: true; origins: string[] } | { ok: false; error: string }> {
  const cleaned = cleanOrigins(text);
  if (!cleaned.ok) return cleaned;
  const [sf] = await db.select({ id: storefronts.id, before: storefronts.allowedOrigins }).from(storefronts).where(eq(storefronts.organizationId, organizationId)).limit(1);
  if (!sf) return { ok: false, error: "Set up your storefront first (name and web address)." };
  const now = new Date().toISOString();
  await db.update(storefronts).set({ allowedOrigins: cleaned.origins.length ? cleaned.origins.join("\n") : null, updatedAt: now }).where(eq(storefronts.organizationId, organizationId));
  await audit(organizationId, userId, sf.id, "allowed_websites", sf.before, cleaned.origins.join(", ") || null);
  return { ok: true, origins: cleaned.origins };
}

export type KeyContext = { keyId: string; kind: KeyKind; organizationId: string; storefrontId: string; allowedOrigins: string | null };

/** The working key behind this text, or null (wrong, unknown or turned off all look the same). The company comes from the key. */
export async function lookupApiKey(raw: string): Promise<KeyContext | null> {
  if (!looksLikeApiKey(raw)) return null;
  const [row] = await db
    .select({
      id: storefrontApiKeys.id,
      kind: storefrontApiKeys.kind,
      organizationId: storefrontApiKeys.organizationId,
      storefrontId: storefrontApiKeys.storefrontId,
      lastUsedAt: storefrontApiKeys.lastUsedAt,
      allowedOrigins: storefronts.allowedOrigins,
    })
    .from(storefrontApiKeys)
    .innerJoin(storefronts, and(eq(storefronts.id, storefrontApiKeys.storefrontId), eq(storefronts.organizationId, storefrontApiKeys.organizationId)))
    .where(and(eq(storefrontApiKeys.keyHash, hashApiKey(raw)), isNull(storefrontApiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  // "Last used" is for the owner's eyes only; a failure to note it must never stop a request.
  if (!row.lastUsedAt || Date.now() - Date.parse(row.lastUsedAt.includes("T") ? row.lastUsedAt : row.lastUsedAt.replace(" ", "T") + "Z") > 5 * 60 * 1000) {
    db.update(storefrontApiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(storefrontApiKeys.id, row.id)).catch(() => {});
  }
  return { keyId: row.id, kind: row.kind, organizationId: row.organizationId, storefrontId: row.storefrontId, allowedOrigins: row.allowedOrigins };
}

export type RequestStatusView = {
  reference: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Present once staff have made the free shipping label for this request's quotation. */
  label: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; labelUrl: string | null } | null;
};

/** One request's status for the company's website to show its sender. Only this company's requests; no prices or staff notes. */
export async function requestStatusByReference(organizationId: string, reference: string): Promise<RequestStatusView | null> {
  const [r] = await db
    .select({
      reference: websiteRequests.reference,
      status: websiteRequests.status,
      createdAt: websiteRequests.createdAt,
      updatedAt: websiteRequests.updatedAt,
      quotationId: websiteRequests.quotationId,
    })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.reference, reference)))
    .limit(1);
  if (!r) return null;
  let label: RequestStatusView["label"] = null;
  if (r.quotationId) {
    const [qt] = await db
      .select({
        labelStatus: purchasingQuotations.labelStatus,
        labelCarrier: purchasingQuotations.labelCarrier,
        labelUrl: purchasingQuotations.labelUrl,
        labelTrackingNumber: purchasingQuotations.labelTrackingNumber,
        labelTrackingUrl: purchasingQuotations.labelTrackingUrl,
      })
      .from(purchasingQuotations)
      .where(and(eq(purchasingQuotations.id, r.quotationId), eq(purchasingQuotations.organizationId, organizationId)))
      .limit(1);
    if (qt && qt.labelStatus === "GENERATED") label = { carrier: qt.labelCarrier ?? null, trackingNumber: qt.labelTrackingNumber ?? null, trackingUrl: qt.labelTrackingUrl ?? null, labelUrl: qt.labelUrl ?? null };
  }
  return { reference: r.reference, status: API_STATUS[r.status as RequestStatus] ?? "received", createdAt: r.createdAt, updatedAt: r.updatedAt, label };
}
