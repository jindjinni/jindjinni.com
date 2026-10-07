// Chat rules that don't touch the database or the screen -- who may read which room, statuses, message and file checks, link detection.
// Pure functions only, so they can be unit tested and shared by the server and the browser.

import { departmentsFor, type Access } from "@/lib/permissions";

export const MAX_MESSAGE = 2000;
export const MAX_NOTE = 60;
export const MAX_ATTACH_BYTES = 4 * 1024 * 1024;
export const PAGE_SIZE = 50;
/** More than this many messages from one person inside RATE_WINDOW_MS is "slow down" (stops a stuck button or a runaway script). */
export const RATE_MAX = 12;
export const RATE_WINDOW_MS = 10_000;
/** Someone seen in the app within this long counts as online. The screens report in every few seconds. */
export const ONLINE_WINDOW_MS = 90_000;
/** The "last seen" stamp is only rewritten when it is older than this, so a busy screen doesn't write to the database on every refresh. */
export const SEEN_WRITE_MS = 20_000;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ChatStatus = "AVAILABLE" | "BUSY" | "LUNCH" | "AWAY" | "OUT_OF_OFFICE";
export type ChatState = ChatStatus | "OFFLINE";

/** What a person can set, in the order the picker shows them. */
export const STATUS_CHOICES: { value: ChatStatus; label: string; hint: string }[] = [
  { value: "AVAILABLE", label: "Online", hint: "Around and happy to chat" },
  { value: "BUSY", label: "Busy", hint: "Working, reply when you can" },
  { value: "LUNCH", label: "At lunch", hint: "Back soon" },
  { value: "AWAY", label: "Away", hint: "Stepped away" },
  { value: "OUT_OF_OFFICE", label: "Out of office", hint: "Not working today" },
];

export const STATE_LABEL: Record<ChatState, string> = {
  AVAILABLE: "Online",
  BUSY: "Busy",
  LUNCH: "At lunch",
  AWAY: "Away",
  OUT_OF_OFFICE: "Out of office",
  OFFLINE: "Offline",
};

export function isChatStatus(v: unknown): v is ChatStatus {
  return typeof v === "string" && STATUS_CHOICES.some((c) => c.value === v);
}

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  // The database stamps some columns "YYYY-MM-DD HH:MM:SS" (UTC, no zone); the app writes ISO elsewhere.
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso) ? iso.replace(" ", "T") + "Z" : iso;
  return Date.parse(s);
}

/**
 * What to show next to a person. "Online" only counts while they are really in the app; what they chose themselves
 * (busy, lunch, away, out of office) is kept even if they have left, but is shown dimmed (`active` false).
 */
export function presenceOf(status: ChatStatus | null | undefined, lastSeenAt: string | null | undefined, nowMs: number): { state: ChatState; active: boolean } {
  const seen = ms(lastSeenAt);
  const active = Number.isFinite(seen) && nowMs - seen <= ONLINE_WINDOW_MS;
  const s: ChatStatus = status && isChatStatus(status) ? status : "AVAILABLE";
  if (s === "AVAILABLE") return active ? { state: "AVAILABLE", active: true } : { state: "OFFLINE", active: false };
  return { state: s, active };
}

/** A short note next to the status ("Back at 2pm"). Trimmed, one line. */
export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
  return t || null;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const DEPT_ROOMS: { dept: string; label: string }[] = [
  { dept: "purchasing", label: "Purchasing" },
  { dept: "receiving", label: "Receiving" },
  { dept: "accounts", label: "Accounts" },
  { dept: "customer-service", label: "Customer Service" },
  { dept: "inventory", label: "Inventory" },
  { dept: "sales", label: "Sales" },
  { dept: "marketing", label: "Marketing" },
  { dept: "hr", label: "HR" },
];

export const EVERYONE = "everyone";

export type Room = { key: string; label: string; kind: "everyone" | "dept" };

/** The group rooms this role can open: the whole-company room, then a room for each department they can open. */
export function groupRoomsFor(role: string, access?: Access): Room[] {
  const mine = new Set(departmentsFor(role, access));
  return [
    { key: EVERYONE, label: "Everyone", kind: "everyone" },
    ...DEPT_ROOMS.filter((d) => mine.has(d.dept)).map((d) => ({ key: `dept:${d.dept}`, label: d.label, kind: "dept" as const })),
  ];
}

export function dmKey(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

export type ParsedRoom = { kind: "everyone" } | { kind: "dept"; dept: string } | { kind: "dm"; a: string; b: string };

export function parseRoom(key: unknown): ParsedRoom | null {
  if (typeof key !== "string") return null;
  if (key === EVERYONE) return { kind: "everyone" };
  if (key.startsWith("dept:")) {
    const dept = key.slice(5);
    return DEPT_ROOMS.some((d) => d.dept === dept) ? { kind: "dept", dept } : null;
  }
  if (key.startsWith("dm:")) {
    const parts = key.split(":");
    if (parts.length !== 3 || !parts[1] || !parts[2] || parts[1] === parts[2]) return null;
    if (parts[1] > parts[2]) return null; // always stored sorted, so one pair has exactly one key
    return { kind: "dm", a: parts[1], b: parts[2] };
  }
  return null;
}

/** Whether this person may read and post in this room. (For a private message the server also checks the other person is in the company.) */
export function canUseRoom(key: unknown, userId: string, role: string, access?: Access): boolean {
  const r = parseRoom(key);
  if (!r) return false;
  if (r.kind === "everyone") return true;
  if (r.kind === "dept") return departmentsFor(role, access).includes(r.dept);
  return r.a === userId || r.b === userId;
}

/** The other person in a private message, or null if this isn't one involving `me`. */
export function dmPartner(key: string, me: string): string | null {
  const r = parseRoom(key);
  if (!r || r.kind !== "dm") return null;
  if (r.a === me) return r.b;
  if (r.b === me) return r.a;
  return null;
}

export function roomLabel(key: string, partnerName?: string | null): string {
  const r = parseRoom(key);
  if (!r) return "Chat";
  if (r.kind === "everyone") return "Everyone";
  if (r.kind === "dept") return DEPT_ROOMS.find((d) => d.dept === r.dept)?.label ?? r.dept;
  return partnerName || "Private message";
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Tidies what someone typed: no stray control characters, no run of blank lines, no trailing spaces. */
export function cleanBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain-language reason a message can't be sent, or null if it's fine. */
export function messageProblem(body: string, hasAttachment: boolean): string | null {
  if (!body && !hasAttachment) return "Type a message first.";
  if (body.length > MAX_MESSAGE) return `That message is too long (up to ${MAX_MESSAGE.toLocaleString("en-US")} characters).`;
  return null;
}

export function rateLimited(recentCount: number): boolean {
  return recentCount >= RATE_MAX;
}

export type ChatAttachmentDto = { id: string; filename: string; contentType: string; size: number; isImage: boolean };

export type ChatMessageDto = {
  seq: number;
  room: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  changedAt: string;
  edited: boolean;
  deleted: boolean;
  attachment: ChatAttachmentDto | null;
};

export type ChatPersonDto = {
  id: string;
  name: string;
  roleLabel: string;
  state: ChatState;
  active: boolean;
  note: string | null;
  isMe: boolean;
};

/** A message turned into the short line used in lists and alerts. */
export function previewOf(m: Pick<ChatMessageDto, "body" | "deleted" | "attachment">): string {
  if (m.deleted) return "This message was deleted.";
  const t = m.body.replace(/\s+/g, " ").trim();
  if (t) return t.length > 80 ? t.slice(0, 79) + "…" : t;
  return m.attachment ? (m.attachment.isImage ? "Sent a photo" : `Sent ${m.attachment.filename}`) : "";
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function displayName(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const local = (email ?? "").split("@")[0].trim();
  return local || "Someone";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0])[0] ?? "?";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : "";
  return (first + last).toUpperCase();
}

const STATE_RANK: Record<ChatState, number> = { AVAILABLE: 0, BUSY: 1, LUNCH: 2, AWAY: 3, OUT_OF_OFFICE: 4, OFFLINE: 5 };

/** People with something unread first, then who is around (online, busy...), then everyone else, each group by name. Me last of all. */
export function sortPeople<T extends { id: string; name: string; state: ChatState; active: boolean; isMe: boolean }>(people: T[], unreadFrom: (id: string) => number): T[] {
  const rank = (p: T) => (p.isMe ? 3 : unreadFrom(p.id) > 0 ? 0 : p.active || p.state === "AVAILABLE" ? 1 : 2);
  return [...people].sort((a, b) => rank(a) - rank(b) || STATE_RANK[a.state] - STATE_RANK[b.state] || a.name.localeCompare(b.name));
}

export function unreadTotal(byRoom: Record<string, number>): number {
  return Object.values(byRoom).reduce((s, n) => s + n, 0);
}

/** "(3) Chat" -- what the browser tab says while there is something new. */
export function tabTitle(unread: number, base: string): string {
  return unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
}

// ---------------------------------------------------------------------------
// Links in messages
// ---------------------------------------------------------------------------

export type Segment = { text: string; href?: string };

/** Splits a message into plain pieces and web links (http and https only). The text itself is never treated as markup. */
export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let url = m[0];
    // Sentence punctuation after a link isn't part of it.
    const open = (u: string) => (u.match(/\(/g) ?? []).length;
    const close = (u: string) => (u.match(/\)/g) ?? []).length;
    while (/[.,!?;:\]]$/.test(url) || (url.endsWith(")") && close(url) > open(url))) url = url.slice(0, -1);
    let ok = false;
    try {
      const u = new URL(url);
      ok = (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
    } catch {
      ok = false;
    }
    if (!ok) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: url, href: url });
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const EXT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const ATTACH_HELP = "Photos (PNG, JPG, GIF, WebP), PDF, text, CSV, Word or Excel, up to 4 MB.";

export function safeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "file").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (base || "file").slice(-80);
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** The real type of an uploaded file, judged by its name AND what is actually inside it, or null if it isn't allowed. */
export function attachmentType(filename: string, bytes: Uint8Array): { mime: string; isImage: boolean } | null {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const mime = EXT_TYPE[ext];
  if (!mime || bytes.length === 0) return null;
  let good = false;
  if (ext === "png") good = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
  else if (ext === "jpg" || ext === "jpeg") good = startsWith(bytes, [0xff, 0xd8, 0xff]);
  else if (ext === "gif") good = startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  else if (ext === "webp") good = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  else if (ext === "pdf") good = startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  else if (ext === "docx" || ext === "xlsx") good = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  else good = !bytes.subarray(0, 2048).includes(0); // txt, csv: text, not a disguised program
  return good ? { mime, isImage: mime.startsWith("image/") } : null;
}
