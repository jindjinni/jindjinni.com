// One door to every AI service a company can plug in (Claude today, ChatGPT too; adding another is one more adapter here).
// The rest of the platform (Jin, label-photo reading, industry news) talks to `chat()` in a single, provider-neutral shape
// and never to a provider directly, so which AI a company chose never changes how a feature is written.
//
// Messages use one internal shape (text, tool calls, tool results, images); each adapter translates it to its provider's
// own format and back.

export type AiProvider = "anthropic" | "openai";
export const PROVIDERS: AiProvider[] = ["anthropic", "openai"];
export const isProvider = (v: unknown): v is AiProvider => v === "anthropic" || v === "openai";

export const PROVIDER_LABEL: Record<AiProvider, string> = { anthropic: "Claude", openai: "ChatGPT" };
export const PROVIDER_MAKER: Record<AiProvider, string> = { anthropic: "Anthropic", openai: "OpenAI" };
export const PROVIDER_CONSOLE: Record<AiProvider, string> = { anthropic: "console.anthropic.com", openai: "platform.openai.com" };

// *_TEST_BASE point the calls at a fake server for automated tests. Ignored on Vercel.
const testBase = (name: string) => (process.env.VERCEL ? "" : process.env[name] || "");
export const anthropicBase = () => testBase("ANTHROPIC_TEST_BASE") || "https://api.anthropic.com";
export const openaiBase = () => testBase("OPENAI_TEST_BASE") || "https://api.openai.com";

/** Pure: does this look like a key from that provider? */
export function looksLikeKey(provider: AiProvider, key: string): boolean {
  if (provider === "anthropic") return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
  return /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/.test(key);
}

/** Pure: which provider a pasted key seems to belong to (null when it looks like neither). */
export function guessProvider(key: string): AiProvider | null {
  return PROVIDERS.find((p) => looksLikeKey(p, key)) ?? null;
}

export type AiPurpose = "jin" | "news" | "photo";

/** The model for a provider and job. Env settings override; the defaults are small, fast and cheap. */
export function modelFor(provider: AiProvider, purpose: AiPurpose): string {
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  const env = purpose === "jin" ? process.env.JIN_MODEL : purpose === "news" ? process.env.INDUSTRY_NEWS_MODEL : process.env.RECALL_PHOTO_MODEL;
  return env || "claude-haiku-4-5-20251001";
}

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "image"; mediaType: string; data: string };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type ToolDef = { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] } };

export type ChatOpts = { purpose: AiPurpose; system?: string; messages: Msg[]; tools?: ToolDef[]; maxTokens: number; timeoutMs: number };
export type ChatResult = { ok: true; content: Block[]; stop: "end" | "tool_use" | "length" } | { ok: false; status: number };

export type KeyLike = { key: string; provider: AiProvider };

const blocksOf = (c: string | Block[]): Block[] => (typeof c === "string" ? [{ type: "text", text: c }] : c);

// ---------------------------------------------------------------- Claude

function toAnthropic(m: Msg) {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: m.content.map((b) => (b.type === "image" ? { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.data } } : b)),
  };
}

async function anthropicChat(ai: KeyLike, o: ChatOpts): Promise<ChatResult> {
  try {
    const res = await fetch(`${anthropicBase()}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": ai.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: modelFor("anthropic", o.purpose), max_tokens: o.maxTokens, ...(o.system ? { system: o.system } : {}), messages: o.messages.map(toAnthropic), ...(o.tools?.length ? { tools: o.tools } : {}) }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as { content?: Block[]; stop_reason?: string };
    const content = (Array.isArray(data.content) ? data.content : []).filter((b) => b && (b.type === "text" || b.type === "tool_use"));
    return { ok: true, content, stop: data.stop_reason === "tool_use" ? "tool_use" : data.stop_reason === "max_tokens" ? "length" : "end" };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ---------------------------------------------------------------- ChatGPT (OpenAI)

type OaMsg = Record<string, unknown>;

function toOpenAi(system: string | undefined, messages: Msg[]): OaMsg[] {
  const out: OaMsg[] = system ? [{ role: "system", content: system }] : [];
  for (const m of messages) {
    const blocks = blocksOf(m.content);
    if (m.role === "assistant") {
      const text = blocks.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
      const calls = blocks.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use").map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of blocks) if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
    const parts: Record<string, unknown>[] = blocks.flatMap((b): Record<string, unknown>[] =>
      b.type === "text" ? [{ type: "text", text: b.text }] : b.type === "image" ? [{ type: "image_url", image_url: { url: `data:${b.mediaType};base64,${b.data}` } }] : [],
    );
    if (parts.length) out.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? (parts[0].text as string) : parts });
  }
  return out;
}

async function openaiChat(ai: KeyLike, o: ChatOpts): Promise<ChatResult> {
  try {
    const res = await fetch(`${openaiBase()}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${ai.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: modelFor("openai", o.purpose),
        max_completion_tokens: o.maxTokens,
        messages: toOpenAi(o.system, o.messages),
        ...(o.tools?.length ? { tools: o.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
      }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] } }[] };
    const ch = data.choices?.[0];
    const content: Block[] = [];
    if (ch?.message?.content) content.push({ type: "text", text: ch.message.content });
    for (const c of ch?.message?.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(c.function?.arguments || "{}");
      } catch {
        /* a garbled argument list becomes "no arguments"; the tool then answers with what it needs */
      }
      content.push({ type: "tool_use", id: c.id, name: c.function?.name ?? "", input });
    }
    const calls = content.some((b) => b.type === "tool_use");
    return { ok: true, content, stop: calls ? "tool_use" : ch?.finish_reason === "length" ? "length" : "end" };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** One question to whichever AI the key belongs to. */
export function chat(ai: KeyLike, opts: ChatOpts): Promise<ChatResult> {
  return ai.provider === "openai" ? openaiChat(ai, opts) : anthropicChat(ai, opts);
}

/** Plain text of a reply. */
export const textOf = (content: Block[]) => content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();

/** Asks the provider whether a key is accepted (lists models: free, nothing is billed). */
export async function checkKey(provider: AiProvider, key: string): Promise<"ok" | "refused" | "unreachable"> {
  try {
    const res =
      provider === "openai"
        ? await fetch(`${openaiBase()}/v1/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
        : await fetch(`${anthropicBase()}/v1/models?limit=1`, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "refused" : "unreachable";
  } catch {
    return "unreachable";
  }
}
