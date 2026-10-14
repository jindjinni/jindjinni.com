// Saved box sizes for the Shipping department: length x width x height in inches, never a weight (the weight is typed for every box).
// A box is the same box whichever way round its sides are typed, so 25 x 21 x 21 and 21 x 25 x 21 count as one size.

export const MAX_SIDE_IN = 60; // the same limit the label check uses
export const MAX_SAVED_SIZES = 40;
export const MAX_NAME = 40;

export type BoxDims = { lengthIn: number; widthIn: number; heightIn: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Three sides as typed -> a box, or a plain message saying which side is wrong. */
export function parseBoxSize(raw: { lengthIn: unknown; widthIn: unknown; heightIn: unknown }): { ok: true; size: BoxDims } | { ok: false; error: string } {
  const sides: [keyof BoxDims, string][] = [["lengthIn", "long"], ["widthIn", "wide"], ["heightIn", "high"]];
  const out: Partial<BoxDims> = {};
  for (const [k, word] of sides) {
    const n = Number(String(raw[k] ?? "").trim());
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `Type how ${word} the box is in inches (more than zero).` };
    if (n > MAX_SIDE_IN) return { ok: false, error: `No side can be longer than ${MAX_SIDE_IN} inches.` };
    out[k] = round2(n);
  }
  return { ok: true, size: out as BoxDims };
}

const num = (n: number) => String(round2(n));

/** Same box = same key, however the sides were ordered. */
export function sizeKey(d: BoxDims): string {
  return [d.lengthIn, d.widthIn, d.heightIn].map(round2).sort((a, b) => a - b).map(num).join("x");
}

/** "25 × 21 × 21 in", the way it was typed. */
export function sizeLabel(d: BoxDims): string {
  return `${num(d.lengthIn)} × ${num(d.widthIn)} × ${num(d.heightIn)} in`;
}

/** An optional short name ("Medium"). One line, trimmed, never cut silently: too long is a message. */
export function cleanSizeName(raw: unknown): { ok: true; name: string | null } | { ok: false; error: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: true, name: null };
  if (name.length > MAX_NAME) return { ok: false, error: `The name can be up to ${MAX_NAME} letters.` };
  return { ok: true, name };
}

/**
 * The sizes used on earlier labels, most used first (ties: the more recent). `parcels` are the saved parcel texts, newest first.
 * Sizes in `skipKeys` (already saved or removed from the list) are left out. Weight is never read.
 */
export function recentSizes(parcels: (string | null)[], skipKeys: Set<string>, limit = 6): (BoxDims & { count: number })[] {
  const seen = new Map<string, BoxDims & { count: number; first: number }>();
  parcels.forEach((text, i) => {
    let p: { lengthIn?: unknown; widthIn?: unknown; heightIn?: unknown };
    try {
      p = JSON.parse(text ?? "");
    } catch {
      return;
    }
    const got = parseBoxSize({ lengthIn: p?.lengthIn, widthIn: p?.widthIn, heightIn: p?.heightIn });
    if (!got.ok) return;
    const key = sizeKey(got.size);
    if (skipKeys.has(key)) return;
    const have = seen.get(key);
    if (have) have.count++;
    else seen.set(key, { ...got.size, count: 1, first: i });
  });
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map(({ first: _first, ...rest }) => rest);
}
