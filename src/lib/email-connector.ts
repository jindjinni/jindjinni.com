// Connecting a company's own mailbox and sending customer emails through it. Three ways in, all "plug and play":
//  - Google (Gmail / Google Workspace) and Microsoft (Outlook / Microsoft 365): an admin signs in on the provider's page
//    and approves one permission, "send email for me". We keep only the long-lived permission (refresh token), encrypted.
//  - Any other mailbox: its address and password (an app password where the host needs one), tested before saving.
// With nothing connected, emails go from the platform's own sending address.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { emailConnections } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";
import { buildMime, toRaw } from "@/lib/gmail-mime";
import { sendCustomerEmail, type EmailAttachment } from "@/lib/email";
import { smtpSend, SmtpAuthError, type SmtpCredential } from "@/lib/email-smtp";

export type OAuthProviderKey = "GOOGLE" | "MICROSOFT";
export type ProviderKey = OAuthProviderKey | "SMTP";

// *_TEST_BASE point the provider calls at a fake server for automated tests. Ignored on Vercel.
const testBase = (name: string) => (process.env.VERCEL ? "" : process.env[name] || "");

type OAuthProvider = {
  key: OAuthProviderKey;
  slug: string;
  label: string;
  configured: () => boolean;
  clientId: () => string;
  clientSecret: () => string;
  authUrl: () => string;
  tokenUrl: () => string;
  scopes: string[];
  extraAuth: Record<string, string>;
  /** Does the granted-scope text from the token reply include the permission to send? */
  canSend: (scope: string) => boolean;
  emailOf: (claims: Record<string, unknown>) => string | null;
};

export const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const MS_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

export const OAUTH: Record<OAuthProviderKey, OAuthProvider> = {
  GOOGLE: {
    key: "GOOGLE",
    slug: "google",
    label: "Google",
    configured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    clientId: () => process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? "",
    authUrl: () => (testBase("GOOGLE_TEST_BASE") ? `${testBase("GOOGLE_TEST_BASE")}/auth` : "https://accounts.google.com/o/oauth2/v2/auth"),
    tokenUrl: () => (testBase("GOOGLE_TEST_BASE") ? `${testBase("GOOGLE_TEST_BASE")}/token` : "https://oauth2.googleapis.com/token"),
    scopes: ["openid", "email", SEND_SCOPE],
    // offline + consent: Google always hands back the long-lived permission we need to send later.
    extraAuth: { access_type: "offline", prompt: "consent select_account" },
    canSend: (s) => s.split(/\s+/).includes(SEND_SCOPE),
    emailOf: (c) => (c.email_verified === false ? null : typeof c.email === "string" ? c.email : null),
  },
  MICROSOFT: {
    key: "MICROSOFT",
    slug: "microsoft",
    label: "Microsoft",
    configured: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    clientId: () => process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET ?? "",
    authUrl: () => (testBase("MICROSOFT_TEST_BASE") ? `${testBase("MICROSOFT_TEST_BASE")}/auth` : `${MS_BASE}/authorize`),
    tokenUrl: () => (testBase("MICROSOFT_TEST_BASE") ? `${testBase("MICROSOFT_TEST_BASE")}/token` : `${MS_BASE}/token`),
    scopes: ["openid", "email", "profile", "offline_access", "https://graph.microsoft.com/Mail.Send"],
    extraAuth: { prompt: "select_account", response_mode: "query" },
    canSend: (s) => s.split(/\s+/).some((x) => /(^|\/)mail\.send$/i.test(x)),
    emailOf: (c) => {
      const v = typeof c.email === "string" ? c.email : typeof c.preferred_username === "string" ? c.preferred_username : null;
      return v && v.includes("@") ? v : null;
    },
  },
};
export const providerBySlug = (slug: string) => Object.values(OAUTH).find((p) => p.slug === slug) ?? null;

const googleSendUrl = () => (testBase("GOOGLE_TEST_BASE") ? `${testBase("GOOGLE_TEST_BASE")}/gmail/send` : "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
const googleRevokeUrl = () => (testBase("GOOGLE_TEST_BASE") ? `${testBase("GOOGLE_TEST_BASE")}/revoke` : "https://oauth2.googleapis.com/revoke");
const graphBase = () => (testBase("MICROSOFT_TEST_BASE") ? `${testBase("MICROSOFT_TEST_BASE")}/graph` : "https://graph.microsoft.com/v1.0");

export const redirectUriFor = (origin: string, p: OAuthProvider) => `${process.env.APP_ORIGIN || origin}/api/email-connect/${p.slug}/callback`;

export async function getConnection(organizationId: string) {
  const [row] = await db.select().from(emailConnections).where(eq(emailConnections.organizationId, organizationId)).limit(1);
  return row ?? null;
}

/** Turns a sign-in code into the mailbox's address and long-lived permission. */
export async function exchangeCode(p: OAuthProvider, code: string, redirectUri: string): Promise<{ ok: true; email: string; refreshToken: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(p.tokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: p.clientId(), client_secret: p.clientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const j = (await res.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; scope?: string };
    if (!res.ok || !j.id_token) return { ok: false, error: "exchange" };
    if (!p.canSend(j.scope ?? "")) return { ok: false, error: "missing_permission" };
    if (!j.refresh_token) return { ok: false, error: "no_refresh" };
    // The ID token came straight from the provider over TLS, so reading its claims is enough.
    const claims = JSON.parse(Buffer.from(j.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    const email = p.emailOf(claims);
    if (!email) return { ok: false, error: "no_email" };
    return { ok: true, email: email.toLowerCase(), refreshToken: j.refresh_token };
  } catch {
    return { ok: false, error: "exchange" };
  }
}

export async function saveConnection(organizationId: string, userId: string, provider: ProviderKey, email: string, secret: string) {
  const values = { provider, accountEmail: email.toLowerCase(), credentialEnc: encryptToken(secret), status: "ACTIVE" as const, lastError: null, connectedByUserId: userId, connectedAt: sql`(current_timestamp)`, lastUsedAt: null };
  await db
    .insert(emailConnections)
    .values({ id: `econ_${crypto.randomUUID().replace(/-/g, "")}`, organizationId, ...values })
    .onConflictDoUpdate({ target: emailConnections.organizationId, set: values });
}

/** Removes the connection (and, for Google, tells Google to forget the permission). Always removes ours, even if the provider can't be reached. */
export async function removeConnection(organizationId: string) {
  const row = await getConnection(organizationId);
  if (!row) return;
  await db.delete(emailConnections).where(and(eq(emailConnections.id, row.id), eq(emailConnections.organizationId, organizationId)));
  if (row.provider === "GOOGLE") {
    const token = decryptToken(row.credentialEnc);
    if (token) {
      try {
        await fetch(googleRevokeUrl(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
      } catch {
        // The permission can also be removed from the Google account's security page.
      }
    }
  }
}

class NeedsReconnect extends Error {}
type Conn = NonNullable<Awaited<ReturnType<typeof getConnection>>>;

/** A fresh short-lived access token from the saved permission. Microsoft may hand back a new permission, which is saved. */
async function accessToken(conn: Conn): Promise<string> {
  const p = OAUTH[conn.provider === "MICROSOFT" ? "MICROSOFT" : "GOOGLE"];
  const refresh = decryptToken(conn.credentialEnc);
  if (!refresh) throw new NeedsReconnect("The saved permission can't be read any more.");
  const res = await fetch(p.tokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: p.clientId(), client_secret: p.clientSecret(), refresh_token: refresh, grant_type: "refresh_token", ...(p.key === "MICROSOFT" ? { scope: p.scopes.join(" ") } : {}) }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  if (j.error === "invalid_grant" || j.error === "interaction_required") throw new NeedsReconnect("The provider says the permission was removed or expired.");
  if (!res.ok || !j.access_token) throw new Error("The email provider didn't accept the sign-in. Try again in a minute.");
  if (j.refresh_token && j.refresh_token !== refresh) {
    await db.update(emailConnections).set({ credentialEnc: encryptToken(j.refresh_token) }).where(eq(emailConnections.id, conn.id));
  }
  return j.access_token;
}

export type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string | null;
  replyTo?: string | null;
  /** Visible copies (Cc). Hidden copies are `bcc`. */
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
};
export type SendResult = { ok: true; from: string | null } | { ok: false; error: string };

const RECONNECT_MESSAGE = "The connected email needs to be reconnected. An admin can do that in Email Settings.";

async function sendViaGoogle(conn: Conn, a: SendArgs) {
  const token = await accessToken(conn);
  const raw = toRaw(buildMime({ from: { name: a.fromName, address: conn.accountEmail }, to: a.to, cc: a.cc, bcc: a.bcc, replyTo: a.replyTo, subject: a.subject, text: a.text, html: a.html, attachments: a.attachments }));
  const res = await fetch(googleSendUrl(), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }) });
  if (res.status === 401 || res.status === 403) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || /insufficient|PERMISSION_DENIED|invalid_grant|unauthenticated/i.test(detail)) throw new NeedsReconnect("Google refused to send: permission missing.");
    throw new Error("Google refused to send that message.");
  }
  if (!res.ok) throw new Error(res.status === 429 ? "Gmail's sending limit was reached. Try again later." : "Gmail couldn't send that message. Check the customer's address and try again.");
}

const GRAPH_INLINE_MAX = 3 * 1024 * 1024; // larger files go up in pieces
const GRAPH_CHUNK = 3 * 1024 * 1024;
const contentTypeOf = (name: string) => ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as Record<string, string>)[name.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";

/** Microsoft sends from the signed-in mailbox under its own display name; the message is built as a draft so large files can be attached, then sent. */
async function sendViaMicrosoft(conn: Conn, a: SendArgs) {
  const token = await accessToken(conn);
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const addr = (x: string) => ({ emailAddress: { address: x } });
  const fail = (status: number, what: string): never => {
    if (status === 401) throw new NeedsReconnect("Microsoft refused: permission missing.");
    throw new Error(status === 429 ? "Microsoft's sending limit was reached. Try again later." : `Microsoft couldn't ${what}.`);
  };
  const draft = await fetch(`${graphBase()}/me/messages`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      subject: a.subject,
      body: { contentType: "HTML", content: a.html },
      toRecipients: [addr(a.to)],
      ccRecipients: (a.cc ?? []).map(addr),
      bccRecipients: (a.bcc ?? []).map(addr),
      ...(a.replyTo ? { replyTo: [addr(a.replyTo)] } : {}),
    }),
  });
  if (!draft.ok) fail(draft.status, "prepare that message");
  const { id } = (await draft.json()) as { id: string };
  try {
    for (const f of a.attachments ?? []) {
      if (f.content.length <= GRAPH_INLINE_MAX) {
        const r = await fetch(`${graphBase()}/me/messages/${id}/attachments`, { method: "POST", headers: h, body: JSON.stringify({ "@odata.type": "#microsoft.graph.fileAttachment", name: f.filename, contentType: contentTypeOf(f.filename), contentBytes: f.content.toString("base64") }) });
        if (!r.ok) fail(r.status, "attach a file");
      } else {
        const s = await fetch(`${graphBase()}/me/messages/${id}/attachments/createUploadSession`, { method: "POST", headers: h, body: JSON.stringify({ AttachmentItem: { attachmentType: "file", name: f.filename, size: f.content.length, contentType: contentTypeOf(f.filename) } }) });
        if (!s.ok) fail(s.status, "attach a large file");
        const { uploadUrl } = (await s.json()) as { uploadUrl: string };
        for (let start = 0; start < f.content.length; start += GRAPH_CHUNK) {
          const end = Math.min(start + GRAPH_CHUNK, f.content.length);
          const r = await fetch(uploadUrl, { method: "PUT", headers: { "content-length": String(end - start), "content-range": `bytes ${start}-${end - 1}/${f.content.length}` }, body: new Uint8Array(f.content.subarray(start, end)) });
          if (!r.ok) fail(r.status, "upload a large file");
        }
      }
    }
    const sent = await fetch(`${graphBase()}/me/messages/${id}/send`, { method: "POST", headers: h });
    if (!sent.ok) fail(sent.status, "send that message");
  } catch (e) {
    // Don't leave a half-built draft in the company's mailbox.
    await fetch(`${graphBase()}/me/messages/${id}`, { method: "DELETE", headers: h }).catch(() => undefined);
    throw e;
  }
}

async function sendViaSmtp(conn: Conn, a: SendArgs) {
  const raw = decryptToken(conn.credentialEnc);
  if (!raw) throw new NeedsReconnect("The saved password can't be read any more.");
  const cred = JSON.parse(raw) as SmtpCredential;
  try {
    await smtpSend(cred, { from: { name: a.fromName, address: conn.accountEmail }, to: a.to, cc: a.cc, bcc: a.bcc, replyTo: a.replyTo, subject: a.subject, text: a.text, html: a.html, attachments: a.attachments });
  } catch (e) {
    if (e instanceof SmtpAuthError) throw new NeedsReconnect(e.message);
    throw new Error("The mail server couldn't send that message. Check the customer's address and try again.");
  }
}

/**
 * Sends one customer email for a company: from its connected mailbox when it has one, otherwise from the platform's
 * address. A connected mailbox that stopped working never falls back silently to another sender.
 */
export async function sendOrgEmail(organizationId: string, args: SendArgs): Promise<SendResult> {
  const conn = await getConnection(organizationId);
  if (!conn) {
    const r = await sendCustomerEmail(args);
    return r.ok ? { ok: true, from: null } : r;
  }
  if (conn.status !== "ACTIVE") return { ok: false, error: RECONNECT_MESSAGE };
  try {
    if (conn.provider === "MICROSOFT") await sendViaMicrosoft(conn, args);
    else if (conn.provider === "SMTP") await sendViaSmtp(conn, args);
    else await sendViaGoogle(conn, args);
    await db.update(emailConnections).set({ lastUsedAt: sql`(current_timestamp)`, lastError: null }).where(eq(emailConnections.id, conn.id));
    return { ok: true, from: conn.accountEmail };
  } catch (e) {
    if (e instanceof NeedsReconnect) {
      await db.update(emailConnections).set({ status: "NEEDS_RECONNECT", lastError: e.message }).where(eq(emailConnections.id, conn.id));
      return { ok: false, error: RECONNECT_MESSAGE };
    }
    const msg = e instanceof Error ? e.message : "The email couldn't be sent.";
    await db.update(emailConnections).set({ lastError: msg }).where(eq(emailConnections.id, conn.id));
    console.error("[email-connector] send failed:", msg);
    return { ok: false, error: msg };
  }
}
