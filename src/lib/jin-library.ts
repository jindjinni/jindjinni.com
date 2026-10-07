// Jin's industry library: reading it (for Jin) and managing it (for the platform owner).

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jinKnowledge } from "@/db/schema";
import { BUILTIN_KNOWLEDGE, type KnowledgeCategory, type KnowledgeEntry } from "@/lib/industry-knowledge-builtin";
import { parseFormats, type FormatEntry } from "@/lib/industry-checks";

const CATEGORIES: KnowledgeCategory[] = ["lot_serial", "ndc", "barcode", "recall", "counterfeit", "manufacturer", "rule", "other"];
export const isCategory = (v: unknown): v is KnowledgeCategory => typeof v === "string" && (CATEGORIES as string[]).includes(v);
export const CATEGORY_LIST = CATEGORIES;

type Row = typeof jinKnowledge.$inferSelect;

const toEntry = (r: Row): KnowledgeEntry => ({
  id: r.id,
  title: r.title,
  category: isCategory(r.category) ? r.category : "other",
  brand: r.brand,
  body: r.body,
  source: r.source,
  verifiedOn: r.verifiedOn,
  formats: r.formats ? parseFormats(r.formats) : undefined,
  formatKind: r.formatKind === "serial" ? "serial" : r.formatKind === "lot" ? "lot" : undefined,
});

/** Everything Jin may use: the built-in facts plus the owner's LIVE entries. Drafts never leave the library page. */
export async function liveKnowledge(): Promise<KnowledgeEntry[]> {
  const rows = await db.select().from(jinKnowledge).where(eq(jinKnowledge.status, "LIVE")).orderBy(desc(jinKnowledge.updatedAt)).limit(1000);
  return [...BUILTIN_KNOWLEDGE, ...rows.map(toEntry)];
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

/** Pure: the entries that best fit a question or search, best first. A brand match counts most. */
export function searchKnowledge(all: KnowledgeEntry[], query: string, brand?: string, max = 5): KnowledgeEntry[] {
  const q = words(query);
  const b = (brand ?? "").trim().toLowerCase();
  const scored = all
    .map((e) => {
      const hay = `${e.title} ${e.brand ?? ""} ${e.body}`.toLowerCase();
      let score = 0;
      for (const w of q) if (hay.includes(w)) score += e.title.toLowerCase().includes(w) ? 3 : 1;
      if (b && e.brand && e.brand.toLowerCase().includes(b)) score += 6;
      if (!b && e.brand && q.some((w) => e.brand!.toLowerCase().includes(w))) score += 4;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, c) => c.score - a.score);
  return scored.slice(0, max).map((x) => x.e);
}

/** The house rules: always handed to Jin, however the question is worded. */
export const houseRules = (all: KnowledgeEntry[]) => all.filter((e) => e.category === "rule");

/** The recorded lot/serial layouts for a brand (or all brands when none is given), for the format check. */
export function formatEntries(all: KnowledgeEntry[], brand: string | undefined, kind: "lot" | "serial" | undefined): FormatEntry[] {
  const b = (brand ?? "").trim().toLowerCase();
  return all
    .filter((e) => e.formats?.length && (!kind || e.formatKind === kind) && (!b || (e.brand ?? "").toLowerCase().includes(b) || b.includes((e.brand ?? "~").toLowerCase())))
    .map((e) => ({ title: e.title, brand: e.brand, kind: e.formatKind ?? "lot", formats: e.formats!, verifiedOn: e.verifiedOn }));
}

// ---- owner side

export async function allLibraryRows(): Promise<Row[]> {
  return db.select().from(jinKnowledge).orderBy(jinKnowledge.category, jinKnowledge.brand, jinKnowledge.title);
}

export async function libraryRow(id: string): Promise<Row | null> {
  const [r] = await db.select().from(jinKnowledge).where(and(eq(jinKnowledge.id, id))).limit(1);
  return r ?? null;
}
