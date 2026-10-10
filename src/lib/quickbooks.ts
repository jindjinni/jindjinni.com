// The company's own QuickBooks Online connection. READ ONLY, by construction:
//  - the only call that reaches QuickBooks' data is `readApi`, and it can only send GET requests (a test checks the source);
//  - the other calls are the sign-in itself (trade the one-time code for a key, refresh the key, hand the key back).
// We keep one long-lived key per company, encrypted (AES-256-GCM, lib/email-connector-crypto.ts). QuickBooks hands out a NEW key
// every time one is refreshed, so each refresh saves the newest one. Never log or show a token.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accountingConnections } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";

// QBO_TEST_BASE points every call at a fake server for automated tests. Ignored on Vercel.
const testBase = () => (process.env.VERCEL ? "" : process.env.QBO_TEST_BASE || "");

export const qboConfigured = () => !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
const clientId = () => process.env.QBO_CLIENT_ID ?? "";
const clientSecret = () => process.env.QBO_CLIENT_SECRET ?? "";
const sandbox = () => process.env.QBO_ENV === "sandbox";

export const qboScope = "com.intuit.quickbooks.accounting";
export const qboAuthUrl = () => (testBase() ? `${testBase()}/auth` : "https://appcenter.intuit.com/connect/oauth2");
const tokenUrl = () => (testBase() ? `${testBase()}/token` : "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
const revokeUrl = () => (testBase() ? `${testBase()}/revoke` : "https://developer.api.intuit.com/v2/oauth2/tokens/revoke");
const apiBase = () => (testBase() ? `${testBase()}/api` : sandbox() ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");
export const qboRedirectUri = (origin: string) => `${process.env.APP_ORIGIN || origin}/api/quickbooks/callback`;
const basic = () => "Basic " + Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");

export async function getAccounting(organizationId: string) {
  const [row] = await db.select().from(accountingConnections).where(eq(accountingConnections.organizationId, organizationId)).limit(1);
  return row ?? null;
}

export type AccountingView = { connected: boolean; status: "ACTIVE" | "NEEDS_RECONNECT" | "NONE"; companyName: string | null; realmId: string | null; connectedByName: string | null; connectedAt: string | null; lastUsedAt: string | null; lastError: string | null; termsVersion: string | null };

export async function accountingView(organizationId: string): Promise<AccountingView> {
  const c = await getAccounting(organizationId);
  if (!c) return { connected: false, status: "NONE", companyName: null, realmId: null, connectedByName: null, connectedAt: null, lastUsedAt: null, lastError: null, termsVersion: null };
  return { connected: true, status: c.status, companyName: c.companyName, realmId: c.realmId, connectedByName: c.connectedByName, connectedAt: c.connectedAt, lastUsedAt: c.lastUsedAt, lastError: c.lastError, termsVersion: c.termsVersion };
}

type TokenReply = { access_token?: string; refresh_token?: string; error?: string };

/** Trades the one-time code from the sign-in for the company's keys. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ ok: true; accessToken: string; refreshToken: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: basic() },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const j = (await res.json().catch(() => ({}))) as TokenReply;
    if (!res.ok || !j.access_token || !j.refresh_token) return { ok: false, error: "exchange" };
    return { ok: true, accessToken: j.access_token, refreshToken: j.refresh_token };
  } catch {
    return { ok: false, error: "exchange" };
  }
}

export class QboNeedsReconnect extends Error {}

// Refreshing a key replaces it, so two refreshes at once would cancel each other. One at a time per company.
const refreshing = new Map<string, Promise<string>>();

async function freshAccessToken(organizationId: string, enc: string): Promise<string> {
  const pending = refreshing.get(organizationId);
  if (pending) return pending;
  const run = (async () => {
    const refresh = decryptToken(enc);
    if (!refresh) throw new QboNeedsReconnect("The saved permission can't be read any more.");
    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: basic() },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    });
    const j = (await res.json().catch(() => ({}))) as TokenReply;
    if (j.error === "invalid_grant" || res.status === 400 || res.status === 401) throw new QboNeedsReconnect("QuickBooks says the permission was removed or has expired.");
    if (!res.ok || !j.access_token) throw new Error("QuickBooks didn't accept the sign-in. Try again in a minute.");
    if (j.refresh_token && j.refresh_token !== refresh) {
      await db.update(accountingConnections).set({ credentialEnc: encryptToken(j.refresh_token) }).where(eq(accountingConnections.organizationId, organizationId));
    }
    return j.access_token;
  })();
  refreshing.set(organizationId, run);
  try {
    return await run;
  } finally {
    refreshing.delete(organizationId);
  }
}

export type ReadResult = { ok: true; json: unknown } | { ok: false; reconnect: boolean; error: string };

/** The ONE place that talks to QuickBooks' data. GET only. `path` is under the company (for example "query" or "reports/AgedReceivables"). */
async function readApi(realmId: string, accessToken: string, path: string, params: Record<string, string>): Promise<{ status: number; json: unknown }> {
  const url = new URL(`${apiBase()}/v3/company/${encodeURIComponent(realmId)}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("minorversion", "70");
  const res = await fetch(url, { method: "GET", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, cache: "no-store" });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Reads from a company's QuickBooks. Marks the connection "needs reconnect" when QuickBooks refuses the saved permission. */
export async function qboRead(organizationId: string, path: string, params: Record<string, string> = {}): Promise<ReadResult> {
  const conn = await getAccounting(organizationId);
  if (!conn) return { ok: false, reconnect: false, error: "QuickBooks isn't connected." };
  if (conn.status !== "ACTIVE") return { ok: false, reconnect: true, error: "QuickBooks needs to be reconnected." };
  try {
    const token = await freshAccessToken(organizationId, conn.credentialEnc);
    const r = await readApi(conn.realmId, token, path, params);
    if (r.status === 401 || r.status === 403) throw new QboNeedsReconnect("QuickBooks refused the saved permission.");
    if (r.status < 200 || r.status >= 300) {
      await db.update(accountingConnections).set({ lastError: `QuickBooks answered ${r.status}.` }).where(eq(accountingConnections.organizationId, organizationId));
      return { ok: false, reconnect: false, error: r.status === 429 ? "QuickBooks asked us to slow down. Try again in a minute." : "QuickBooks couldn't give us that report right now. Try again in a minute." };
    }
    await db.update(accountingConnections).set({ lastUsedAt: sql`(current_timestamp)`, lastError: null }).where(eq(accountingConnections.organizationId, organizationId));
    return { ok: true, json: r.json };
  } catch (e) {
    if (e instanceof QboNeedsReconnect) {
      await db.update(accountingConnections).set({ status: "NEEDS_RECONNECT", lastError: e.message }).where(eq(accountingConnections.organizationId, organizationId));
      return { ok: false, reconnect: true, error: "QuickBooks needs to be reconnected." };
    }
    console.error("[quickbooks] read failed:", e instanceof Error ? e.message : e);
    return { ok: false, reconnect: false, error: "We couldn't reach QuickBooks. Try again in a minute." };
  }
}

/** The company's name in QuickBooks, read with a brand-new key at connect time (nothing is saved yet). */
export async function companyNameFor(realmId: string, accessToken: string): Promise<string | null> {
  try {
    const r = await readApi(realmId, accessToken, `companyinfo/${encodeURIComponent(realmId)}`, {});
    const name = (r.json as { CompanyInfo?: { CompanyName?: string } }).CompanyInfo?.CompanyName;
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}

export async function saveQuickBooks(organizationId: string, by: { userId: string; name: string | null }, c: { realmId: string; refreshToken: string; companyName: string | null; termsVersion: string }) {
  const values = {
    provider: "QBO" as const,
    realmId: c.realmId,
    companyName: c.companyName,
    credentialEnc: encryptToken(c.refreshToken),
    status: "ACTIVE" as const,
    lastError: null,
    termsVersion: c.termsVersion,
    termsAcceptedAt: new Date().toISOString(),
    connectedByUserId: by.userId,
    connectedByName: by.name,
    connectedAt: sql`(current_timestamp)`,
    lastUsedAt: null,
  };
  await db
    .insert(accountingConnections)
    .values({ id: `acon_${crypto.randomUUID().replace(/-/g, "")}`, organizationId, ...values })
    .onConflictDoUpdate({ target: accountingConnections.organizationId, set: values });
}

/** Disconnects: tells QuickBooks to forget the key, then removes ours. Ours is always removed, even if QuickBooks can't be reached. */
export async function removeQuickBooks(organizationId: string) {
  const row = await getAccounting(organizationId);
  if (!row) return;
  await db.delete(accountingConnections).where(and(eq(accountingConnections.id, row.id), eq(accountingConnections.organizationId, organizationId)));
  const token = decryptToken(row.credentialEnc);
  if (token) {
    try {
      await fetch(revokeUrl(), { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: basic() }, body: JSON.stringify({ token }) });
    } catch {
      // It can also be removed from QuickBooks under the company's connected apps.
    }
  }
}
