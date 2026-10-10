// "Other mailbox" support: sending through the mailbox's own mail server (SMTP) with its address and password, for
// hosts that aren't Google or Microsoft. Also works out, from the address alone, which host a company's mail is on.

import { promises as dns } from "node:dns";
import net from "node:net";
import nodemailer from "nodemailer";
import type { EmailAttachment } from "@/lib/email";

export type SmtpCredential = { host: string; port: number; user: string; pass: string };

export const ALLOWED_SMTP_PORTS = [465, 587, 2525];

/** Well-known mail hosts by the domain of the address. Each needs an "app password" rather than the normal one. */
const KNOWN: { match: RegExp; label: string; host: string; port: number; appPassword?: string }[] = [
  { match: /^(yahoo\.|ymail\.|rocketmail\.)/, label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465, appPassword: "Yahoo requires an app password (Account security → Generate app password)." },
  { match: /^(aol\.)/, label: "AOL Mail", host: "smtp.aol.com", port: 465, appPassword: "AOL requires an app password (Account security → Generate app password)." },
  { match: /^(icloud\.com|me\.com|mac\.com)$/, label: "iCloud Mail", host: "smtp.mail.me.com", port: 587, appPassword: "iCloud requires an app-specific password (appleid.apple.com → Sign-In and Security)." },
  { match: /^(zoho\.|zohomail\.)/, label: "Zoho Mail", host: "smtp.zoho.com", port: 465 },
];

/** Looks at a mail host's name (the MX record) and says who runs the mail for that domain. */
export function classifyMx(hosts: string[]): { kind: "GOOGLE" | "MICROSOFT" | "SMTP"; label: string; host?: string; port?: number; note?: string } {
  const h = hosts.map((x) => x.toLowerCase());
  const any = (re: RegExp) => h.some((x) => re.test(x));
  if (any(/(^|\.)(google|googlemail)\.com$/)) return { kind: "GOOGLE", label: "Google (Gmail / Google Workspace)" };
  if (any(/(^|\.)(outlook|protection\.outlook|hotmail)\.com$/)) return { kind: "MICROSOFT", label: "Microsoft (Outlook / Microsoft 365)" };
  if (any(/secureserver\.net$/)) return { kind: "SMTP", label: "GoDaddy email", host: "smtpout.secureserver.net", port: 465 };
  if (any(/(^|\.)zoho\.(com|eu|in)$/)) return { kind: "SMTP", label: "Zoho Mail", host: "smtp.zoho.com", port: 465 };
  if (any(/(^|\.)(registrar-servers|privateemail)\.com$/)) return { kind: "SMTP", label: "Namecheap email", host: "mail.privateemail.com", port: 465 };
  if (any(/(ionos|1and1|kundenserver)\.(com|de)$/)) return { kind: "SMTP", label: "IONOS email", host: "smtp.ionos.com", port: 587 };
  if (any(/(^|\.)(yahoodns|yahoo)\.net$/)) return { kind: "SMTP", label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465 };
  return { kind: "SMTP", label: "Your mail host" };
}

export type Detected = { kind: "GOOGLE" | "MICROSOFT" | "SMTP"; label: string; host: string; port: number; note: string | null };

/** From an address, which connection fits best and (for "other") the mail server to try. */
export async function detectMail(email: string): Promise<Detected> {
  const domain = email.split("@")[1]?.toLowerCase().trim() ?? "";
  if (/^(gmail|googlemail)\.com$/.test(domain)) return { kind: "GOOGLE", label: "Google (Gmail)", host: "", port: 0, note: null };
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return { kind: "MICROSOFT", label: "Microsoft (Outlook)", host: "", port: 0, note: null };
  for (const k of KNOWN) if (k.match.test(domain)) return { kind: "SMTP", label: k.label, host: k.host, port: k.port, note: k.appPassword ?? null };
  let mx: string[] = [];
  try {
    mx = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    // no MX record found: fall through to a guess
  }
  const c = classifyMx(mx);
  if (c.kind !== "SMTP") return { kind: c.kind, label: c.label, host: "", port: 0, note: null };
  return { kind: "SMTP", label: c.label, host: c.host ?? (domain ? `mail.${domain}` : ""), port: c.port ?? 587, note: null };
}

const isPrivate = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:127.") || x.startsWith("::ffff:10.") || x.startsWith("::ffff:192.168.");
};

// SMTP_TEST_ALLOW_LOCAL lets automated tests use a mail server on this computer. It is ignored on Vercel.
const allowLocal = () => !process.env.VERCEL && process.env.SMTP_TEST_ALLOW_LOCAL === "1";

/** Only public mail servers on the usual ports: this server must never be steered at an internal address. */
export async function checkSmtpTarget(host: string, port: number): Promise<string | null> {
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.length > 253) return "That mail server name doesn't look right.";
  if (allowLocal()) return null;
  if (!ALLOWED_SMTP_PORTS.includes(port)) return `Use port ${ALLOWED_SMTP_PORTS.join(", ")}.`;
  if (net.isIP(host)) return "Enter the mail server's name (like smtp.yourhost.com), not a number.";
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.length === 0 || addrs.some((a) => isPrivate(a.address))) return "That mail server isn't a public one.";
  } catch {
    return "We couldn't find that mail server. Check the name.";
  }
  return null;
}

function transportFor(c: SmtpCredential) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    requireTLS: c.port !== 465 && !allowLocal(),
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: allowLocal() ? { rejectUnauthorized: false } : undefined,
  });
}

/** Tries the login without sending anything. Returns a message in plain words when it doesn't work. */
export async function verifySmtp(c: SmtpCredential): Promise<string | null> {
  try {
    await transportFor(c).verify();
    return null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "EAUTH") return "The mail server refused that password. Gmail, Yahoo, iCloud and many others need an \"app password\" rather than your normal one.";
    if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET" || code === "ECONNREFUSED" || code === "EDNS") return "We couldn't reach that mail server. Check the server name and port.";
    return "The mail server didn't accept the connection. Check the server, port and password.";
  }
}

export class SmtpAuthError extends Error {}

export async function smtpSend(
  c: SmtpCredential,
  a: { from: { name?: string | null; address: string }; to: string; cc?: string[]; bcc?: string[]; replyTo?: string | null; subject: string; text: string; html: string; attachments?: EmailAttachment[] },
): Promise<void> {
  try {
    await transportFor(c).sendMail({
      from: a.from.name ? { name: a.from.name, address: a.from.address } : a.from.address,
      to: a.to,
      cc: a.cc?.length ? a.cc : undefined,
      bcc: a.bcc?.length ? a.bcc : undefined,
      replyTo: a.replyTo || undefined,
      subject: a.subject,
      text: a.text,
      html: a.html,
      attachments: (a.attachments ?? []).map((x) => ({ filename: x.filename, content: x.content })),
    });
  } catch (e) {
    if ((e as { code?: string }).code === "EAUTH") throw new SmtpAuthError("The mail server refused the saved password.");
    throw e;
  }
}
