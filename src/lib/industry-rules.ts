// Rules for the Home screen's industry watch: how a headline or an FDA recall is sorted (kind and how serious), how the
// two feeds are read, and how the stories are grouped by brand for display. Pure; reads nothing and fetches nothing.

import { mentionsBrand, type BrandProfile } from "@/lib/industry-brands";

export type NewsKind = "recall" | "safety" | "business" | "product" | "other";
export type Severity = "urgent" | "important" | "info";

export const KIND_LABEL: Record<NewsKind, string> = { recall: "Recall", safety: "Safety notice", business: "Business", product: "New product", other: "News" };
export const SEVERITY_LABEL: Record<Severity, string> = { urgent: "Urgent", important: "Important", info: "FYI" };
const SEVERITY_RANK: Record<Severity, number> = { urgent: 0, important: 1, info: 2 };

export const KINDS: NewsKind[] = ["recall", "safety", "business", "product", "other"];
export const SEVERITIES: Severity[] = ["urgent", "important", "info"];
export const isKind = (v: unknown): v is NewsKind => typeof v === "string" && (KINDS as string[]).includes(v);
export const isSeverity = (v: unknown): v is Severity => typeof v === "string" && (SEVERITIES as string[]).includes(v);

/** How long a story stays on the Home screen, and how long it is kept at all. */
export const SHOW_DAYS = 90;
export const KEEP_DAYS = 180;
/** A recall or notice this recent (or newer) is listed under "Needs your attention". */
export const ATTENTION_DAYS = 45;

const URGENT = /\b(recall(s|ed)?|safety (notice|alert|communication)|field (safety|correction)|do not use|stop using|bad lots?|affected lots?|class i\b|deaths?|serious injur\w*|bankrupt\w*|chapter 11|insolven\w*|ceas\w* operations|shut\w* down|wind\w* down|withdrawn from (the )?market|market withdrawal)\b/i;
const IMPORTANT = /\b(discontinu\w*|shortage|supply (issue|problem|disruption|constraint)s?|backorder\w*|out of stock|lawsuit|class action|warning letter|fda (warn|investigat)\w*|price (cut|increase|change)s?|coverage (change|cut)s?|formulary|layoffs?|acquir\w*|acquisition|merger|merge[sd]?|delist\w*|no longer (available|sold|cover)\w*|sunset\w*|end of life)\b/i;
const PRODUCT = /\b(launch\w*|new (sensor|pump|meter|system|product|app|generation)|introduc\w*|unveil\w*|fda (clear|approv|authoriz)\w*|clearance|cleared|approved|partnership|next[- ]gen\w*|rollout|rolls? out|available (now|in))\b/i;
const SAFETY_ONLY = /\b(safety|warning|alert|malfunction|inaccurate|incorrect (reading|dose)|adverse|injur\w*)\b/i;

/** Sorts a headline (and its snippet) by keywords. The AI summary, when it is on, can overrule this. */
export function classify(text: string): { kind: NewsKind; severity: Severity } {
  const t = text.replace(/\s+/g, " ");
  if (/\brecall/i.test(t)) return { kind: "recall", severity: "urgent" };
  if (/\b(safety (notice|alert|communication)|field (safety|correction)|do not use|stop using|bad lots?|affected lots?)\b/i.test(t)) return { kind: "safety", severity: "urgent" };
  if (/\b(bankrupt\w*|chapter 11|insolven\w*|ceas\w* operations|shut\w* down|wind\w* down|withdrawn from (the )?market|market withdrawal)\b/i.test(t)) return { kind: "business", severity: "urgent" };
  if (URGENT.test(t)) return { kind: "safety", severity: "urgent" };
  if (IMPORTANT.test(t)) return { kind: /\b(lawsuit|class action|warning letter|fda)\b/i.test(t) ? "safety" : "business", severity: "important" };
  if (SAFETY_ONLY.test(t)) return { kind: "safety", severity: "important" };
  if (PRODUCT.test(t)) return { kind: "product", severity: "info" };
  return { kind: "other", severity: "info" };
}

// ---------------------------------------------------------------- small text helpers

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
export const stripTags = (s: string) => decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Only web addresses are kept, so a story can never carry a "javascript:" link. */
export function safeUrl(u: string | null | undefined): string | null {
  const s = (u ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

/** ISO date-time for any date text the feeds use, or null when it isn't a date. */
export function toIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = /^\d{8}$/.test(s.trim()) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s.trim();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A short stable code for a link or title, used to recognise a story seen before. */
export function fingerprintOf(s: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 31 + c) | 0;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/** Headlines say the same story in many outlets; this is the title with the outlet and punctuation removed, for spotting repeats. */
export const normalTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- the two feeds

export type Story = {
  kind: NewsKind;
  severity: Severity;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: string;
  fingerprint: string;
};

export type RawHeadline = { title: string; url: string; source: string; publishedAt: string; snippet: string };

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};

/** Reads a Google News RSS search result into headlines. Items with no title, web link or date are skipped. */
export function parseNewsRss(xml: string): RawHeadline[] {
  const out: RawHeadline[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    let title = stripTags(tag(item, "title"));
    const url = safeUrl(stripTags(tag(item, "link")));
    const publishedAt = toIso(stripTags(tag(item, "pubDate")));
    let source = stripTags(tag(item, "source"));
    if (!title || !url || !publishedAt) continue;
    if (source && title.toLowerCase().endsWith(` - ${source.toLowerCase()}`)) title = title.slice(0, title.length - source.length - 3).trim();
    else if (!source) {
      const i = title.lastIndexOf(" - ");
      if (i > 20) {
        source = title.slice(i + 3).trim();
        title = title.slice(0, i).trim();
      }
    }
    out.push({ title, url, source, publishedAt, snippet: "" });
  }
  return out;
}

type FdaRecord = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

const FDA_URGENT = /\b(death|died|serious injur\w*|hazard\w*|incorrect\w*|inaccurate\w*|false (high|low|reading)|erroneous\w*|too (much|little|high|low)|over-?deliver\w*|under-?deliver\w*|over-?infus\w*|under-?infus\w*|(fail\w*|unable) to (alarm|alert|sound|deliver|stop|work)|may not (alarm|alert|sound|deliver|work|stop)|no (alarm|alert)|shock|fire|burn\w*|class i\b|may (cause|result in|lead to)[^.]{0,60}(injur|harm|death|hypoglyc|hyperglyc))/i;

/** Reads the FDA device recall list (openFDA) into stories; only recalls that mention this brand count. */
export function parseFdaRecalls(json: unknown, profile: BrandProfile): Story[] {
  const results = (json as { results?: FdaRecord[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: Story[] = [];
  for (const r of results) {
    const product = stripTags(str(r.product_description));
    const reason = stripTags(str(r.reason_for_recall));
    const firm = stripTags(str(r.recalling_firm));
    const text = `${product} ${firm} ${reason}`;
    const firmMatch = profile.firms.some((f) => firm.toLowerCase().includes(f.toLowerCase().split(" ")[0]));
    if (!(profile.broadMaker ? mentionsBrand(text, profile) : firmMatch || mentionsBrand(text, profile))) continue;
    const id = str(r.res_event_number) || str(r.cfres_id) || str(r.product_res_number);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const publishedAt = toIso(str(r.event_date_posted)) ?? toIso(str(r.event_date_initiated));
    if (!publishedAt) continue;
    const cf = str(r.cfres_id);
    const url = cf ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?id=${encodeURIComponent(cf)}` : "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm";
    out.push({
      kind: "recall",
      severity: FDA_URGENT.test(`${reason} ${str(r.root_cause_description)}`) ? "urgent" : "important",
      title: clip(`FDA recall: ${product || "product"}`, 160),
      summary: reason ? clip(reason, 240) : null,
      url,
      source: "FDA recall list",
      publishedAt,
      fingerprint: `fda:${id}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- display

export type ShownStory = Story & { id: string; brand: string };

export const ageDays = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));

/** Most serious first, then newest first. */
export function compareStories(a: Pick<Story, "severity" | "publishedAt">, b: Pick<Story, "severity" | "publishedAt">): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.publishedAt.localeCompare(a.publishedAt);
}

export type BrandNews = { brand: string; owner: string; urgent: number; important: number; total: number; stories: ShownStory[] };

/** Every watched brand (even one with nothing new) with its stories, brands with urgent news first, then A to Z. */
export function groupNews(brands: string[], stories: ShownStory[], owners: Record<string, string> = {}): BrandNews[] {
  const rows = brands.map((brand) => {
    const mine = stories.filter((s) => s.brand.toLowerCase() === brand.toLowerCase()).sort(compareStories);
    return { brand, owner: owners[brand] ?? "", urgent: mine.filter((s) => s.severity === "urgent").length, important: mine.filter((s) => s.severity === "important").length, total: mine.length, stories: mine };
  });
  return rows.sort((a, b) => (b.urgent > 0 ? 1 : 0) - (a.urgent > 0 ? 1 : 0) || a.brand.localeCompare(b.brand));
}

/** The stories that need the owner's eye first: urgent and recent. */
export function needsAttention(stories: ShownStory[], now: Date, limit = 8): ShownStory[] {
  return stories
    .filter((s) => s.severity === "urgent" && ageDays(s.publishedAt, now) <= ATTENTION_DAYS)
    .sort(compareStories)
    .slice(0, limit);
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago". */
export function ago(iso: string, now: Date): string {
  const d = ageDays(iso, now);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}
