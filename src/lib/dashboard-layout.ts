// How a person arranges their Home screen: which sections come first and which are open. Pure rules, no reading or writing;
// whatever is stored is re-checked here every time so a bad or old value can never break the page.

export const SECTION_IDS = ["news", "purchasing", "receiving", "accounts"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export type Layout = { order: SectionId[]; open: SectionId[] };

export const isSectionId = (v: unknown): v is SectionId => typeof v === "string" && (SECTION_IDS as readonly string[]).includes(v);

/** News first (recalls and safety notices belong at the top), then the departments, everything closed. */
export const defaultLayout = (): Layout => ({ order: [...SECTION_IDS], open: [] });

const ids = (v: unknown): SectionId[] => {
  const out: SectionId[] = [];
  if (Array.isArray(v)) for (const x of v) if (isSectionId(x) && !out.includes(x)) out.push(x);
  return out;
};

/** Any value in, a valid layout out: unknown names and repeats are dropped and missing sections are put back in the default order. */
export function normalizeLayout(raw: unknown): Layout {
  if (!raw || typeof raw !== "object") return defaultLayout();
  const r = raw as { order?: unknown; open?: unknown };
  const order = ids(r.order);
  for (const id of SECTION_IDS) if (!order.includes(id)) order.push(id);
  return { order, open: ids(r.open) };
}

export function parseLayout(json: string | null | undefined): Layout {
  if (!json) return defaultLayout();
  try {
    return normalizeLayout(JSON.parse(json));
  } catch {
    return defaultLayout();
  }
}

export const serializeLayout = (l: Layout) => JSON.stringify(normalizeLayout(l));

/** The sections this person can see, in their order. */
export const visibleOrder = (l: Layout, available: SectionId[]): SectionId[] => l.order.filter((id) => available.includes(id));

/** Moves a section one place up (-1) or down (+1) among the sections that are shown; the others keep their place. */
export function moveSection(l: Layout, id: SectionId, dir: -1 | 1, available: SectionId[]): Layout {
  const shown = visibleOrder(l, available);
  const at = shown.indexOf(id);
  const other = shown[at + dir];
  if (at < 0 || other === undefined) return l;
  const order = [...l.order];
  const a = order.indexOf(id);
  const b = order.indexOf(other);
  order[a] = other;
  order[b] = id;
  return { ...l, order };
}

export const toggleOpen = (l: Layout, id: SectionId): Layout => ({ ...l, open: l.open.includes(id) ? l.open.filter((x) => x !== id) : [...l.open, id] });

export const setAllOpen = (l: Layout, available: SectionId[], open: boolean): Layout => ({ ...l, open: open ? [...available] : [] });
