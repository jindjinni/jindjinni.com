// Each company's own AI key (Claude from Anthropic, or ChatGPT from OpenAI): where it is kept, how it is checked, and which
// key a request may use. The provider-specific calls live in ai-provider.ts.
//
//  - An owner or admin chooses the AI and pastes the company's key in Settings -> Connectors. We check it with the provider
//    first, keep it encrypted, and use it only for THAT company: label-photo reading and extra capacity for Jin. The cost
//    lands on the company's own account with that provider.
//  - The platform's own key (the ANTHROPIC_API_KEY setting on Vercel) is used here only for the companies the platform
//    runs itself (same list as the Shippo account) and only when that company has not connected its own. Any other
//    company without a key simply doesn't get label-photo reading, so nobody can run up charges on the platform's account.
//  - The industry news on Home is different: it is a built-in courtesy for every company, runs on the platform's key and
//    is shared per brand (see newsAiKey in industry-service.ts), so it needs nothing from the company.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiConnections, organizations } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";
import { newId } from "@/lib/ids";
import { mayUsePlatformShippo as isPlatformCompany } from "@/lib/shippo-connection";
import { checkKey, guessProvider, isProvider, looksLikeKey, PROVIDER_CONSOLE, PROVIDER_LABEL, PROVIDER_MAKER, type AiProvider } from "@/lib/ai-provider";

export { anthropicBase } from "@/lib/ai-provider";

export const NOT_CONNECTED_AI_MESSAGE = "AI isn't connected yet. An owner or admin can add your company's Claude or ChatGPT key in Settings → Connectors.";
export const NEEDS_ATTENTION_AI_MESSAGE = "Your AI provider isn't accepting the saved key. An owner or admin needs to reconnect it in Settings → Connectors.";

const providerOf = (v: string | null | undefined): AiProvider => (isProvider(v) ? v : "anthropic");

export type AiKey = { key: string; source: "company" | "platform"; provider: AiProvider };
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
    return { ok: true, ai: { key, source: "company", provider: providerOf(conn.provider) } };
  }
  const platformKey = process.env.ANTHROPIC_API_KEY;
  if (platformKey) {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (org && isPlatformCompany(org.slug)) return { ok: true, ai: { key: platformKey, source: "platform", provider: "anthropic" } };
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
    .set({ status: "NEEDS_ATTENTION", lastError: "The AI provider no longer accepts this key. Paste a current one.", lastCheckedAt: new Date().toISOString() })
    .where(eq(aiConnections.organizationId, organizationId));
}

export type AiConnectionView = {
  source: "company" | "platform" | "none";
  provider: AiProvider;
  status: "ACTIVE" | "NEEDS_ATTENTION" | "NONE";
  keyHint: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

/** What the Settings page shows. Never includes the key. */
export async function aiConnectionView(organizationId: string): Promise<AiConnectionView> {
  const [conn] = await db.select().from(aiConnections).where(eq(aiConnections.organizationId, organizationId)).limit(1);
  if (conn) return { source: "company", provider: providerOf(conn.provider), status: conn.status, keyHint: conn.keyHint, lastError: conn.lastError, connectedAt: conn.connectedAt };
  const a = await resolveAi(organizationId);
  if (a.ok) return { source: "platform", provider: "anthropic", status: "ACTIVE", keyHint: null, lastError: null, connectedAt: null };
  return { source: "none", provider: "anthropic", status: "NONE", keyHint: null, lastError: null, connectedAt: null };
}

export type AiConnectResult = { ok: true } | { ok: false; error: string };

/** Checks the pasted key with its provider, then saves it (encrypted) as this company's connection, replacing any earlier one. */
export async function connectAi(who: { organizationId: string; userId: string }, providerRaw: string, rawKey: string): Promise<AiConnectResult> {
  const key = rawKey.trim();
  if (!isProvider(providerRaw)) return { ok: false, error: "Choose Claude or ChatGPT first." };
  const provider = providerRaw;
  const label = PROVIDER_LABEL[provider];
  if (!key) return { ok: false, error: `Paste your ${label} key first.` };
  if (!looksLikeKey(provider, key)) {
    const other = guessProvider(key);
    if (other) return { ok: false, error: `That looks like a ${PROVIDER_LABEL[other]} key. Choose ${PROVIDER_LABEL[other]} above, or paste your ${label} key.` };
    return { ok: false, error: `That doesn't look like a ${label} key. It is created at ${PROVIDER_CONSOLE[provider]} under API keys${provider === "anthropic" ? " and starts with sk-ant-" : " and starts with sk-"}.` };
  }
  const verdict = await checkKey(provider, key);
  if (verdict === "refused") return { ok: false, error: `${PROVIDER_MAKER[provider]} didn't accept that key. Copy it again from ${PROVIDER_CONSOLE[provider]} (make sure nothing is missing at the end).` };
  if (verdict === "unreachable") return { ok: false, error: `Couldn't reach ${PROVIDER_MAKER[provider]} to check the key. Try again in a minute.` };
  const values = {
    provider,
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
  const provider = providerOf(conn.provider);
  const maker = PROVIDER_MAKER[provider];
  const verdict = await checkKey(provider, key);
  if (verdict === "ok") {
    await db.update(aiConnections).set({ status: "ACTIVE", lastError: null, lastCheckedAt: now }).where(eq(aiConnections.id, conn.id));
    return { ok: true };
  }
  if (verdict === "refused") {
    await db.update(aiConnections).set({ status: "NEEDS_ATTENTION", lastError: `${maker} no longer accepts this key. Paste a current one.`, lastCheckedAt: now }).where(eq(aiConnections.id, conn.id));
    return { ok: false, error: `${maker} no longer accepts this key. Paste a current one.` };
  }
  return { ok: false, error: `Couldn't reach ${maker}. Try again in a minute.` };
}
