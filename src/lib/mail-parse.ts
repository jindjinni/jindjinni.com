// Turning what Gmail and Microsoft hand back into the plain, safe shape the Inbox stores. Pure (no network, no database) and tested.
// Incoming mail is kept as plain text only: HTML is reduced to its words, so no script, image, link-tracker or style from a
// stranger's email can ever run or load inside the app.

import { snippetOf } from "@/lib/mail-rules";

export const MAX_IN_BODY = 100_000;
export const MAX_IN_SUBJECT = 300;
export const MAX_IN_ADDRESSES = 2_000;
/** Files on received mail: at most this many, and this many bytes together (like the ones we send). */
export const MAX_IN_FILES = 8;
export const MAX_IN_BYTES = 8 * 1024 * 1024;

export type InAttachment = { id: string; filename: string; contentType: string | null; size: number; inline: boolean };
export type ParsedMail = {
  providerId: string;
  threadKey: string | null;
  rfcMessageId: string | null;
  fromName: string | null;
  fromAddress: string | null;
  to: string;
  cc: string;
  subject: string;
  bodyText: string;
  at: string;
  /** Does the email account itself still show it as unread? */
  unread: boolean;
  hasFiles: boolean;
  files: InAttachment[];
};

// ----- text helpers --------------------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: "(c)", reg: "(r)" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** An HTML email reduced to readable plain text. Scripts, styles, comments and tags are dropped; paragraphs and lines are kept. */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title|template|svg|object|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|table|blockquote)\s*>/gi, "\n\n")
    .replace(/<\/(div|tr|li|ul|ol)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/t[dh]\s*>/gi, "\t")
    .replace(/<[^>]*>/g, " ");
  s = decodeEntities(s).replace(/\n[ \t\f\v\u00a0]+/g, "\n");
  return cleanText(s);
}

/** Line endings made plain, runs of blank lines squeezed, trailing spaces removed, and cut to the size we keep. */
export function cleanText(s: string): string {
  const t = s
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v ]+\n/g, "\n")
    .replace(/[ \t\f\v ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length > MAX_IN_BODY ? `${t.slice(0, MAX_IN_BODY)}\n\n[The rest of this email was cut off.]` : t;
}

function decodeBytes(bytes: Buffer, charset: string | null): string {
  const cs = (charset ?? "utf-8").toLowerCase().replace(/^"|"$/g, "");
  try {
    return new TextDecoder(cs === "us-ascii" ? "utf-8" : cs, { fatal: false }).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

/** Subjects and names in the "=?UTF-8?B?...?=" form, turned back into normal text. */
export function decodeMimeWords(v: string): string {
  const s = v.replace(/(\?=)\s+(=\?)/g, "$1$2");
  return s.replace(/=\?([^?\s]+)\?([bqBQ])\?([^?]*)\?=/g, (_m, cs: string, enc: string, data: string) => {
    try {
      const bytes = enc.toLowerCase() === "b" ? Buffer.from(data, "base64") : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return decodeBytes(bytes, cs);
    } catch {
      return data;
    }
  });
}

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

// ----- addresses -----------------------------------------------------------------------------------------------------

export type Addr = { name: string | null; address: string };
const EMAIL = /[^\s<>"',;()]+@[^\s<>"',;()]+\.[^\s<>"',;()]+/;

/** "Pat <pat@x.com>, other@y.com" -> [{Pat, pat@x.com}, {null, other@y.com}]. Anything that isn't an address is skipped. */
export function parseAddressList(header: string | null | undefined): Addr[] {
  if (!header) return [];
  const out: Addr[] = [];
  // Split on commas and semicolons that are not inside quotes or angle brackets.
  const parts: string[] = [];
  let cur = "";
  let q = false;
  let ang = false;
  for (const ch of header) {
    if (ch === '"') q = !q;
    else if (!q && ch === "<") ang = true;
    else if (!q && ch === ">") ang = false;
    if ((ch === "," || ch === ";") && !q && !ang) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const m = p.match(/^\s*([\s\S]*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
    if (m) {
      const name = oneLine(decodeMimeWords(m[1].replace(/^"|"$/g, "").replace(/\\(.)/g, "$1")));
      out.push({ name: name || null, address: m[2].toLowerCase() });
      continue;
    }
    const e = p.match(EMAIL);
    if (e) out.push({ name: null, address: e[0].toLowerCase() });
  }
  return out;
}

export const addrText = (a: Addr) => (a.name ? `${a.name.replace(/[<>,;]/g, "")} <${a.address}>` : a.address);
const joinAddrs = (l: Addr[]) => cap(l.map(addrText).join(", "), MAX_IN_ADDRESSES);

// ----- Gmail ---------------------------------------------------------------------------------------------------------

type GPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GPart[];
};
export type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: GPart;
};

const header = (p: GPart | undefined, name: string): string | null => {
  const h = (p?.headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
};
const charsetOf = (p: GPart) => (header(p, "content-type")?.match(/charset\s*=\s*"?([^";\s]+)/i)?.[1] ?? null);

/** Walks a Gmail message's parts and collects its text and its files. */
function walk(p: GPart, acc: { plain: string[]; html: string[]; files: InAttachment[] }) {
  const type = (p.mimeType ?? "").toLowerCase();
  const isFile = !!p.filename || (!!p.body?.attachmentId && !type.startsWith("text/"));
  if (isFile && (p.body?.attachmentId || p.body?.data)) {
    const disp = header(p, "content-disposition") ?? "";
    acc.files.push({ id: p.body?.attachmentId ?? "", filename: p.filename || "attachment", contentType: type || null, size: p.body?.size ?? 0, inline: /inline/i.test(disp) && !p.filename });
  } else if (type === "text/plain" || type === "text/html") {
    if (p.body?.data) {
      const text = decodeBytes(Buffer.from(p.body.data, "base64url"), charsetOf(p));
      (type === "text/plain" ? acc.plain : acc.html).push(text);
    }
  }
  for (const c of p.parts ?? []) walk(c, acc);
}

export function parseGmailMessage(m: GmailMessage): ParsedMail | null {
  if (!m?.id || !m.payload) return null;
  const p = m.payload;
  const acc = { plain: [] as string[], html: [] as string[], files: [] as InAttachment[] };
  walk(p, acc);
  const bodyText = cleanText(acc.plain.length ? acc.plain.join("\n\n") : acc.html.length ? htmlToText(acc.html.join("\n")) : m.snippet ? decodeEntities(m.snippet) : "");
  const from = parseAddressList(decodeMimeWords(header(p, "from") ?? ""))[0] ?? null;
  const dateHeader = header(p, "date");
  const ms = Number(m.internalDate);
  const at = Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : dateHeader && !Number.isNaN(Date.parse(dateHeader)) ? new Date(dateHeader).toISOString() : new Date().toISOString();
  const real = acc.files.filter((f) => !f.inline);
  return {
    providerId: m.id,
    threadKey: m.threadId ? `g:${m.threadId}` : null,
    rfcMessageId: (header(p, "message-id") ?? "").replace(/[<>\s]/g, "") || null,
    fromName: from?.name ?? null,
    fromAddress: from?.address ?? null,
    to: joinAddrs(parseAddressList(decodeMimeWords(header(p, "to") ?? ""))),
    cc: joinAddrs(parseAddressList(decodeMimeWords(header(p, "cc") ?? ""))),
    subject: cap(oneLine(decodeMimeWords(header(p, "subject") ?? "")), MAX_IN_SUBJECT),
    bodyText,
    at,
    unread: (m.labelIds ?? []).includes("UNREAD"),
    hasFiles: real.length > 0,
    files: real,
  };
}

// ----- Microsoft -----------------------------------------------------------------------------------------------------

type GraphAddr = { emailAddress?: { name?: string; address?: string } };
export type GraphMessage = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: GraphAddr;
  toRecipients?: GraphAddr[];
  ccRecipients?: GraphAddr[];
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  hasAttachments?: boolean;
  isRead?: boolean;
};

const gAddr = (a: GraphAddr | undefined): Addr | null => {
  const address = a?.emailAddress?.address?.trim().toLowerCase();
  if (!address || !address.includes("@")) return null;
  const name = oneLine(a?.emailAddress?.name ?? "");
  return { name: name && name.toLowerCase() !== address ? name : null, address };
};
const gList = (l: GraphAddr[] | undefined) => joinAddrs((l ?? []).map(gAddr).filter((x): x is Addr => !!x));

export function parseGraphMessage(m: GraphMessage): ParsedMail | null {
  if (!m?.id) return null;
  const content = m.body?.content ?? "";
  const isHtml = (m.body?.contentType ?? "").toLowerCase() === "html";
  const bodyText = cleanText(content ? (isHtml ? htmlToText(content) : content) : m.bodyPreview ?? "");
  const from = gAddr(m.from);
  const t = m.receivedDateTime ? Date.parse(m.receivedDateTime) : NaN;
  return {
    providerId: m.id,
    threadKey: m.conversationId ? `m:${m.conversationId}` : null,
    rfcMessageId: (m.internetMessageId ?? "").replace(/[<>\s]/g, "") || null,
    fromName: from?.name ?? null,
    fromAddress: from?.address ?? null,
    to: gList(m.toRecipients),
    cc: gList(m.ccRecipients),
    subject: cap(oneLine(m.subject ?? ""), MAX_IN_SUBJECT),
    bodyText,
    at: Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(),
    unread: m.isRead === false,
    hasFiles: !!m.hasAttachments,
    files: [],
  };
}

export const snippetFor = (p: Pick<ParsedMail, "bodyText">) => snippetOf(p.bodyText);

// ----- replies -------------------------------------------------------------------------------------------------------

/** "Re: " once, never "Re: Re: ". */
export function replySubject(subject: string): string {
  const s = oneLine(subject);
  return /^re:\s/i.test(s) ? s : `Re: ${s || "(no subject)"}`;
}

/** The earlier email quoted under a reply, each line marked with ">". */
export function quotedText(who: string, whenText: string, body: string): string {
  const lines = (body || "").split("\n").slice(0, 200).map((l) => `> ${l}`.trimEnd());
  return `\n\nOn ${whenText}, ${who} wrote:\n${lines.join("\n")}`;
}

/**
 * Who a reply goes to. "Reply" answers the sender. "Reply all" also copies everyone else on the email, except the mailbox itself
 * and addresses already listed. `own` is the mailbox's own address.
 */
export function replyRecipients(msg: { fromAddress: string | null; toAddresses: string | null; ccAddresses: string | null }, own: string | null, all: boolean): { to: string; cc: string } {
  const me = (own ?? "").toLowerCase();
  const sender = msg.fromAddress && msg.fromAddress.toLowerCase() !== me ? msg.fromAddress.toLowerCase() : null;
  const others = (s: string | null) => parseAddressList(s).map((a) => a.address).filter((a) => a !== me && a !== sender);
  if (!all) {
    // Answering our own sent email goes back to who we sent it to.
    if (sender) return { to: sender, cc: "" };
    const first = others(msg.toAddresses)[0] ?? "";
    return { to: first, cc: "" };
  }
  const toList = sender ? [sender] : others(msg.toAddresses);
  const seen = new Set(toList);
  const cc: string[] = [];
  for (const a of [...others(msg.toAddresses), ...others(msg.ccAddresses)]) {
    if (!seen.has(a)) { seen.add(a); cc.push(a); }
  }
  return { to: toList.join(", "), cc: cc.join(", ") };
}
