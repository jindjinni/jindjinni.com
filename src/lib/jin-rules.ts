// Jin, the built-in assistant: the pure rules (limits, cleaning what comes in, reading what goes out). No database, no
// network, so they are easy to test. The brain is in jin-service.ts; the tools are in jin-tools.ts.

export const JIN_NAME = "Jin";

export const JIN_LIMITS = {
  /** Questions one person may ask per day while Jin runs on the platform's key (included with every company). */
  userPerDay: 40,
  /** Questions one whole company may ask per day on the platform's key. */
  companyPerDay: 300,
  /** Questions one person may ask per day when the company connected its own Claude key (abuse guard only). */
  ownKeyUserPerDay: 400,
  /** Longest question, in characters. */
  maxInput: 1500,
  /** How many earlier messages are sent along for context. */
  maxHistory: 10,
  /** Longest earlier message kept, in characters. */
  maxHistoryChars: 3000,
  /** Most tool calls Jin may make to answer one question. */
  maxToolRounds: 4,
  /** Longest answer, in tokens. */
  maxAnswerTokens: 900,
} as const;

export type JinMessage = { role: "user" | "assistant"; content: string };

const strip = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

/** The question as typed, or why it can't be asked. */
export function cleanQuestion(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Type a question first." };
  const text = strip(raw);
  if (!text) return { ok: false, error: "Type a question first." };
  if (text.length > JIN_LIMITS.maxInput) return { ok: false, error: `That is a bit long for me. Please keep it under ${JIN_LIMITS.maxInput} characters.` };
  return { ok: true, text };
}

/**
 * The earlier conversation sent by the browser, made safe: only user/assistant turns of plain text, trimmed, the latest
 * few, starting with a user turn and strictly alternating (which is what the AI service requires).
 */
export function cleanHistory(raw: unknown): JinMessage[] {
  if (!Array.isArray(raw)) return [];
  const msgs: JinMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = strip(content).slice(0, JIN_LIMITS.maxHistoryChars);
    if (text) msgs.push({ role, content: text });
  }
  const recent = msgs.slice(-JIN_LIMITS.maxHistory);
  const out: JinMessage[] = [];
  for (const m of recent) {
    if (out.length === 0 && m.role !== "user") continue;
    if (out.length > 0 && out[out.length - 1].role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  // The new question is appended by the caller as a user turn, so history must end with an assistant turn.
  while (out.length > 0 && out[out.length - 1].role === "user") out.pop();
  return out;
}

/** A link Jin may show: a page inside the signed-in app, nothing else. */
export function isInternalLink(href: string): boolean {
  return /^\/dashboard(\/[A-Za-z0-9._~\-\/]*)?(\?[A-Za-z0-9._~\-=&%]*)?$/.test(href) && !href.includes("//");
}

export type Inline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "link"; text: string; href: string };

/**
 * Reads one line of Jin's answer: **bold** and [label](/dashboard/...) links. A link to anywhere else is shown as plain
 * text, so the answer (or text hidden in company data) can never send someone to another site.
 */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]{1,120})\]\(([^)\s]{1,200})\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else if (isInternalLink(m[3])) out.push({ kind: "link", text: m[2], href: m[3] });
    else out.push({ kind: "text", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

export type Block = { kind: "p"; inline: Inline[] } | { kind: "ul"; items: Inline[][] } | { kind: "ol"; items: Inline[][] };

/** Splits an answer into paragraphs and simple lists. */
export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (ul) {
      if (last?.kind === "ul") last.items.push(parseInline(ul[1]));
      else blocks.push({ kind: "ul", items: [parseInline(ul[1])] });
    } else if (ol) {
      if (last?.kind === "ol") last.items.push(parseInline(ol[1]));
      else blocks.push({ kind: "ol", items: [parseInline(ol[1])] });
    } else blocks.push({ kind: "p", inline: parseInline(line) });
  }
  return blocks;
}

/** "3 questions left today" style hint. */
export const remainingText = (left: number) => (left <= 0 ? "That was your last question for today." : left <= 5 ? `${left} question${left === 1 ? "" : "s"} left today.` : "");

/** An answer as plain sentences for reading aloud: no bold marks, link labels only, list items on their own lines. */
export function plainText(answer: string): string {
  const inl = (parts: Inline[]) => parts.map((p) => p.text).join("");
  return parseAnswer(answer)
    .map((b) => (b.kind === "p" ? inl(b.inline) : b.items.map((it, i) => (b.kind === "ol" ? `${i + 1}. ` : "") + inl(it)).join(". ")))
    .join("\n");
}
