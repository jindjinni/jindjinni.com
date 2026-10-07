// Each company's own Shippo account: where its token is kept, how it is checked, and which token a request may use.
//
//  - A company connects its own Shippo token (Settings -> Shipping). It is stored encrypted and only ever used for THAT
//    company's labels and tracking. Nothing is read from another company's row, ever.
//  - The platform's own Shippo token (the SHIPPO_API_KEY setting on Vercel) is only used for the companies the platform
//    itself runs (BUILT_IN_PLATFORM_SHIPPO_SLUGS, plus the optional SHIPPO_PLATFORM_ORG_SLUGS setting) and only when that
//    company has not connected its own. Any other company without a connection simply can't buy labels, so no company
//    can ever run up charges on the platform's Shippo account.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, purchasingAuditLog, shippoConnections } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";
import { newId } from "@/lib/ids";
import { ShippoRequestError, isShippoTestKey, looksLikeShippoToken, shippoClient, type ShippoClient } from "@/lib/shippo";

/** Companies the platform runs itself; they may use the platform's Shippo account when they have not connected their own. */
const BUILT_IN_PLATFORM_SHIPPO_SLUGS = ["plantarz-medical-exchange", "usa-test-strips-center"];

export function platformShippoSlugs(): string[] {
  const fromEnv = (process.env.SHIPPO_PLATFORM_ORG_SLUGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...BUILT_IN_PLATFORM_SHIPPO_SLUGS, ...fromEnv];
}

/** Pure: may this company fall back to the platform's own Shippo account? */
export function mayUsePlatformShippo(slug: string): boolean {
  return platformShippoSlugs().includes(slug.toLowerCase());
}

export const NOT_CONNECTED_MESSAGE = "Shipping labels aren't connected yet. An owner or admin can connect your Shippo account in Settings → Shipping.";
export const NEEDS_ATTENTION_MESSAGE = "Shippo isn't accepting your saved token. An owner or admin needs to reconnect it in Settings → Shipping.";

export type ShippoAccess =
  | { ok: true; client: ShippoClient; source: "company" | "platform"; isTest: boolean }
  | { ok: false; reason: "not_connected" | "needs_attention"; message: string };

/** Which Shippo token this company's request may use (or why it has none). */
export async function resolveShippo(organizationId: string): Promise<ShippoAccess> {
  const [conn] = await db.select().from(shippoConnections).where(eq(shippoConnections.organizationId, organizationId)).limit(1);
  if (conn) {
    const key = decryptToken(conn.apiKeyEnc);
    if (!key || conn.status === "NEEDS_ATTENTION") {
      if (!key && conn.status === "ACTIVE") {
        await db.update(shippoConnections).set({ status: "NEEDS_ATTENTION", lastError: "The saved token can't be read any more. Paste it again." }).where(eq(shippoConnections.id, conn.id));
      }
      return { ok: false, reason: "needs_attention", message: NEEDS_ATTENTION_MESSAGE };
    }
    return { ok: true, client: shippoClient(key), source: "company", isTest: isShippoTestKey(key) };
  }
  const platformKey = process.env.SHIPPO_API_KEY;
  if (platformKey) {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (org && mayUsePlatformShippo(org.slug)) {
      return { ok: true, client: shippoClient(platformKey), source: "platform", isTest: isShippoTestKey(platformKey) };
    }
  }
  return { ok: false, reason: "not_connected", message: NOT_CONNECTED_MESSAGE };
}

/** After a Shippo call failed: if Shippo refused the company's own token, mark the connection so people see why labels stopped. */
export async function noteShippoFailure(organizationId: string, error: unknown): Promise<void> {
  if (!(error instanceof ShippoRequestError) || (error.status !== 401 && error.status !== 403)) return;
  await db
    .update(shippoConnections)
    .set({ status: "NEEDS_ATTENTION", lastError: "Shippo no longer accepts this token. Paste a current one.", lastCheckedAt: new Date().toISOString() })
    .where(eq(shippoConnections.organizationId, organizationId));
}

export type ShippoCarriers = { usps: boolean; ups: boolean; fedex: boolean };

/** Which of the carriers we use are switched on in the account (Shippo's carrier accounts, active ones). */
export function carriersFrom(accounts: { carrier: string; active?: boolean }[]): ShippoCarriers {
  const on = new Set(accounts.filter((a) => a.active !== false).map((a) => String(a.carrier).toLowerCase()));
  return { usps: on.has("usps") || on.has("shippo"), ups: on.has("ups"), fedex: on.has("fedex") };
}

export const carriersLabel = (c: ShippoCarriers) => [c.usps && "USPS", c.ups && "UPS", c.fedex && "FedEx"].filter(Boolean).join(", ");
export const parseCarriers = (raw: string | null): ShippoCarriers => ({ usps: /USPS/.test(raw ?? ""), ups: /UPS/.test(raw ?? ""), fedex: /FedEx/.test(raw ?? "") });

export type ShippoConnectionView = {
  source: "company" | "platform" | "none";
  status: "ACTIVE" | "NEEDS_ATTENTION" | "NONE";
  keyHint: string | null;
  isTest: boolean;
  carriers: ShippoCarriers;
  lastError: string | null;
  connectedAt: string | null;
  webhookOn: boolean;
};

/** What the Settings page shows. Never includes the token. */
export async function shippoConnectionView(organizationId: string): Promise<ShippoConnectionView> {
  const [conn] = await db.select().from(shippoConnections).where(eq(shippoConnections.organizationId, organizationId)).limit(1);
  if (conn) {
    return {
      source: "company",
      status: conn.status,
      keyHint: conn.keyHint,
      isTest: conn.isTest,
      carriers: parseCarriers(conn.carriers),
      lastError: conn.lastError,
      connectedAt: conn.connectedAt,
      webhookOn: !!conn.webhookId,
    };
  }
  const access = await resolveShippo(organizationId);
  if (access.ok) {
    return { source: "platform", status: "ACTIVE", keyHint: null, isTest: access.isTest, carriers: { usps: false, ups: false, fedex: false }, lastError: null, connectedAt: null, webhookOn: false };
  }
  return { source: "none", status: "NONE", keyHint: null, isTest: false, carriers: { usps: false, ups: false, fedex: false }, lastError: null, connectedAt: null, webhookOn: false };
}

async function auditShipping(organizationId: string, userId: string, field: string, note: string) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId,
    userId,
    recordType: "shipping",
    recordId: organizationId,
    fieldName: field,
    previousValue: null,
    newValue: null,
    note,
  });
}

export type ConnectResult =
  | { ok: true; isTest: boolean; carriers: ShippoCarriers; warning?: string }
  | { ok: false; error: string };

/** Checks the pasted token with Shippo, then saves it (encrypted) as this company's connection, replacing any earlier one. */
export async function connectShippo(who: { organizationId: string; userId: string }, rawToken: string): Promise<ConnectResult> {
  const token = rawToken.trim();
  if (!token) return { ok: false, error: "Paste your Shippo token first." };
  if (!looksLikeShippoToken(token)) {
    return { ok: false, error: "That doesn't look like a Shippo token. It starts with shippo_live_ or shippo_test_ and is found in Shippo under Settings → API." };
  }
  const client = shippoClient(token);
  let carriers: ShippoCarriers;
  try {
    carriers = carriersFrom(await client.listCarrierAccounts());
  } catch (e) {
    if (e instanceof ShippoRequestError && (e.status === 401 || e.status === 403)) {
      return { ok: false, error: "Shippo didn't accept that token. Copy it again from Shippo → Settings → API (make sure nothing is missing at the end)." };
    }
    return { ok: false, error: "Couldn't reach Shippo to check the token. Try again in a minute." };
  }
  const isTest = isShippoTestKey(token);
  const values = {
    apiKeyEnc: encryptToken(token),
    keyHint: token.slice(-4),
    isTest,
    carriers: carriersLabel(carriers) || null,
    status: "ACTIVE" as const,
    lastError: null,
    webhookId: null,
    connectedByUserId: who.userId,
    connectedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
  };
  const [existing] = await db.select({ id: shippoConnections.id }).from(shippoConnections).where(eq(shippoConnections.organizationId, who.organizationId)).limit(1);
  if (existing) await db.update(shippoConnections).set(values).where(eq(shippoConnections.id, existing.id));
  else await db.insert(shippoConnections).values({ id: newId("shpc"), organizationId: who.organizationId, ...values });
  await auditShipping(who.organizationId, who.userId, "shippo", `Shippo account connected (${isTest ? "test" : "live"} token ending ${token.slice(-4)})`);

  const missing = [!carriers.usps && "USPS", !carriers.ups && "UPS"].filter(Boolean);
  const warning = missing.length
    ? `Connected, but ${missing.join(" and ")} ${missing.length === 1 ? "isn't" : "aren't"} switched on in your Shippo account. Turn ${missing.length === 1 ? "it" : "them"} on in Shippo → Settings → Carriers to buy ${missing.join(" / ")} labels here.`
    : undefined;
  return { ok: true, isTest, carriers, warning };
}

/** Removes the company's connection (and, best effort, the notification we registered in their Shippo account). */
export async function disconnectShippo(who: { organizationId: string; userId: string }): Promise<void> {
  const [conn] = await db.select().from(shippoConnections).where(eq(shippoConnections.organizationId, who.organizationId)).limit(1);
  if (!conn) return;
  const key = decryptToken(conn.apiKeyEnc);
  if (key && conn.webhookId) {
    try {
      await shippoClient(key).deleteWebhook(conn.webhookId);
    } catch {
      // Leaving a harmless notification behind in their Shippo account is better than blocking the disconnect.
    }
  }
  await db.delete(shippoConnections).where(eq(shippoConnections.id, conn.id));
  await auditShipping(who.organizationId, who.userId, "shippo", "Shippo account disconnected");
}

/** Asks Shippo again whether the saved token still works and which carriers are on. */
export async function recheckShippo(organizationId: string): Promise<{ ok: boolean; error?: string }> {
  const [conn] = await db.select().from(shippoConnections).where(eq(shippoConnections.organizationId, organizationId)).limit(1);
  if (!conn) return { ok: false, error: NOT_CONNECTED_MESSAGE };
  const key = decryptToken(conn.apiKeyEnc);
  if (!key) {
    await db.update(shippoConnections).set({ status: "NEEDS_ATTENTION", lastError: "The saved token can't be read any more. Paste it again.", lastCheckedAt: new Date().toISOString() }).where(eq(shippoConnections.id, conn.id));
    return { ok: false, error: "The saved token can't be read any more. Paste it again." };
  }
  try {
    const carriers = carriersFrom(await shippoClient(key).listCarrierAccounts());
    await db
      .update(shippoConnections)
      .set({ status: "ACTIVE", lastError: null, carriers: carriersLabel(carriers) || null, lastCheckedAt: new Date().toISOString() })
      .where(eq(shippoConnections.id, conn.id));
    return { ok: true };
  } catch (e) {
    if (e instanceof ShippoRequestError && (e.status === 401 || e.status === 403)) {
      await db.update(shippoConnections).set({ status: "NEEDS_ATTENTION", lastError: "Shippo no longer accepts this token. Paste a current one.", lastCheckedAt: new Date().toISOString() }).where(eq(shippoConnections.id, conn.id));
      return { ok: false, error: "Shippo no longer accepts this token. Paste a current one." };
    }
    return { ok: false, error: "Couldn't reach Shippo. Try again in a minute." };
  }
}
