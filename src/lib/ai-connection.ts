// Each company's own Claude (Anthropic) key: where it is kept, how it is checked, and which key a request may use.
//
//  - An owner or admin pastes the company's key in Settings -> Connectors. We check it with Anthropic first, keep it
//    encrypted, and use it only for THAT company's AI features (reading label photos, checking industry news). The
//    cost lands on the company's own Anthropic account.
//  - The platform's own key (the ANTHROPIC_API_KEY setting on Vercel) is used only for the companies the platform runs
//    itself (same list as the Shippo account) and only when that company has not connected its own. Any other company
//    without a key simply doesn't get the AI features, so nobody can run up charges on the platform's account.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiConnections, organizations } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";
import { newId } from "@/lib/ids";
import { mayUsePlatformShippo as isPlatformCompany } from "@/lib/shippo-connection";

// ANTHROPIC_TEST_BASE points the calls at a fake server for automated tests. Ignored on Vercel.
export const anthropicBase = () => (process.env.VERCEL ? "" : process.env.ANTHROPIC_TEST_BASE || "") || "https://api.anthropic.com";

export const NOT_CONNECTED_AI_MESSAGE = "Claude isn't connected yet. An owner or admin can add your company's Claude key in Settings → Connectors.";
export const NEEDS_ATTENTION_AI_MESSAGE = "Anthropic isn't accepting your saved Claude key. An owner or admin needs to reconnect it in Settings → Connectors.";

/** Pure: does this look like an Anthropic API key? */
export const looksLikeAnthropicKey = (v: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v);

export type AiKey = { key: string; source: "company" | "platform" };
export type AiAccess = { ok: true; ai: AiKey } | { ok: false; reason: "not_connected" | "needs_attention"; message: string };

/** Which Claude key this company's request may use (or why it has none). */
export async function resolveAi(organizationId: string): Promise<AiAccess> {
  const [conn] = await db.select().from(aiConnections).where(eq(aiConnections.organizationId, organizationId)).limit(1);
  if (conn) {
    const key = decryptToken(conn.apiKeyEnc);
    if (!key || conn.status === "NEEDS_ATTENTION") {
      if (!key && conn.status === "ACTIVE") {
        await db.update(aiConnections).set({ status: "NEEDS_ATTENTION", lastError: "The saved key can't be read any more. Paste it again." }).where(eq(aiConnections.id, conn.id));
      }
      return { ok: false, reason: "needs_attention", message: NEEDS_ATTENTION_AI_MESSAGE };
    }
    return { ok: true, ai: { key, source: "company" } };
  }
  const platformKey = process.env.ANTHROPIC_API_KEY;
  if (platformKey) {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (org && isPlatformCompany(org.slug)) return { ok: true, ai: { key: platformKey, source: "platform" } };
  }
  return { ok: false, reason: "not_connected", message: NOT_CONNECTED_AI_MESSAGE };
}

/** The key to use, or null when this company has none (the feature then stays off). */
export async function aiKeyFor(organizationId: string): Promise<AiKey | null> {
  const a = await resolveAi(organizationId);
  return a.ok ? a.ai : null;
}

/** After Anthropic refused a call: if it refused the company's own key, mark the connection so people see why AI stopped. */
export async function noteAiRefused(organizationId: string, ai: AiKey, status: number): Promise<void> {
  if (ai.source !== "company" || (status !== 401 && status !== 403)) return;
  await db
    .update(aiConnections)
    .set({ status: "NEEDS_ATTENTION", lastError: "Anthropic no longer accepts this key. Paste a current one.", lastCheckedAt: new Date().toISOString() })
    .where(eq(aiConnections.organizationId, organizationId));
}

export type AiConnectionView = {
  source: "company" | "platform" | "none";
  status: "ACTIVE" | "NEEDS_ATTENTION" | "NONE";
  keyHint: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

/** What the Settings page shows. Never includes the key. */
export async function aiConnectionView(organizationId: string): Promise<AiConnectionView> {
  const [conn] = await db.select().from(aiConnections).where(eq(aiConnections.organizationId, organizationId)).limit(1);
  if (conn) return { source: "company", status: conn.status, keyHint: conn.keyHint, lastError: conn.lastError, connectedAt: conn.connectedAt };
  const a = await resolveAi(organizationId);
  if (a.ok) return { source: "platform", status: "ACTIVE", keyHint: null, lastError: null, connectedAt: null };
  return { source: "none", status: "NONE", keyHint: null, lastError: null, connectedAt: null };
}

/** Asks Anthropic whether a key is accepted (lists models: free, nothing is billed). */
async function checkKey(key: string): Promise<"ok" | "refused" | "unreachable"> {
  try {
    const res = await fetch(`${anthropicBase()}/v1/models?limit=1`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "refused" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export type AiConnectResult = { ok: true } | { ok: false; error: string };

/** Checks the pasted key with Anthropic, then saves it (encrypted) as this company's connection, replacing any earlier one. */
export async function connectAi(who: { organizationId: string; userId: string }, rawKey: string): Promise<AiConnectResult> {
  const key = rawKey.trim();
  if (!key) return { ok: false, error: "Paste your Claude key first." };
  if (!looksLikeAnthropicKey(key)) {
    return { ok: false, error: "That doesn't look like a Claude key. It starts with sk-ant- and is created in the Anthropic Console under API keys." };
  }
  const verdict = await checkKey(key);
  if (verdict === "refused") return { ok: false, error: "Anthropic didn't accept that key. Copy it again from the Anthropic Console (make sure nothing is missing at the end)." };
  if (verdict === "unreachable") return { ok: false, error: "Couldn't reach Anthropic to check the key. Try again in a minute." };
  const values = {
    apiKeyEnc: encryptToken(key),
    keyHint: key.slice(-4),
    status: "ACTIVE" as const,
    lastError: null,
    connectedByUserId: who.userId,
    connectedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
  };
  const [existing] = await db.select({ id: aiConnections.id }).from(aiConnections).where(eq(aiConnections.organizationId, who.organizationId)).limit(1);
  if (existing) await db.update(aiConnections).set(values).where(eq(aiConnections.id, existing.id));
  else await db.insert(aiConnections).values({ id: newId("aic"), organizationId: who.organizationId, ...values });
  return { ok: true };
}

export async function disconnectAi(organizationId: string): Promise<void> {
  await db.delete(aiConnections).where(eq(aiConnections.organizationId, organizationId));
}

/** Asks Anthropic again whether the saved key still works. */
export async function recheckAi(organizationId: string): Promise<{ ok: boolean; error?: string }> {
  const [conn] = await db.select().from(aiConnections).where(eq(aiConnections.organizationId, organizationId)).limit(1);
  if (!conn) return { ok: false, error: NOT_CONNECTED_AI_MESSAGE };
  const key = decryptToken(conn.apiKeyEnc);
  const now = new Date().toISOString();
  if (!key) {
    await db.update(aiConnections).set({ status: "NEEDS_ATTENTION", lastError: "The saved key can't be read any more. Paste it again.", lastCheckedAt: now }).where(eq(aiConnections.id, conn.id));
    return { ok: false, error: "The saved key can't be read any more. Paste it again." };
  }
  const verdict = await checkKey(key);
  if (verdict === "ok") {
    await db.update(aiConnections).set({ status: "ACTIVE", lastError: null, lastCheckedAt: now }).where(eq(aiConnections.id, conn.id));
    return { ok: true };
  }
  if (verdict === "refused") {
    await db.update(aiConnections).set({ status: "NEEDS_ATTENTION", lastError: "Anthropic no longer accepts this key. Paste a current one.", lastCheckedAt: now }).where(eq(aiConnections.id, conn.id));
    return { ok: false, error: "Anthropic no longer accepts this key. Paste a current one." };
  }
  return { ok: false, error: "Couldn't reach Anthropic. Try again in a minute." };
}
