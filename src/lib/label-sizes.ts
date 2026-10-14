// Shipping label sizes. A roll (thermal) printer prints 4 x 6 inch labels; an ordinary printer prints a full page.
// Shippo draws the label at the size asked for when it is bought, so the size is chosen BEFORE making the label.
// The tokens are Shippo's own `label_file_type` values (docs.goshippo.com -> Shipping label sizes).

export type LabelSizeKey = "4x6" | "4x8" | "a6" | "2.3x7.5" | "letter";

export type LabelSize = { key: LabelSizeKey; token: string; name: string; fits: string };

export const LABEL_SIZES: LabelSize[] = [
  { key: "4x6", token: "PDF_4x6", name: "4 × 6 in (standard roll label)", fits: "The usual roll-printer label. Rollo, Zebra, Munbyn, DYMO 4XL and most thermal printers." },
  { key: "4x8", token: "PDF_4x8", name: "4 × 8 in (long roll label)", fits: "A taller roll label, for printers loaded with 4 × 8 labels." },
  { key: "a6", token: "PDF_A6", name: "A6 (4.1 × 5.8 in)", fits: "Roll or sheet labels in the A6 size, common outside the US." },
  { key: "2.3x7.5", token: "PDF_2.3x7.5", name: "Narrow 2.3 × 7.5 in", fits: "A tall, narrow label for printers loaded with narrow rolls." },
  { key: "letter", token: "PDF", name: "Full page, 8.5 × 11 in (regular printer)", fits: "An ordinary office printer on letter paper. This is how labels were made before sizes were added." },
];

export const DEFAULT_LABEL_SIZE: LabelSizeKey = "letter";

export function isLabelSize(v: unknown): v is LabelSizeKey {
  return typeof v === "string" && LABEL_SIZES.some((s) => s.key === v);
}

/** Whatever was sent, narrowed to a size we offer. Anything unknown falls back (never a made-up size). */
export function parseLabelSize(raw: unknown, fallback: unknown = DEFAULT_LABEL_SIZE): LabelSizeKey {
  if (isLabelSize(raw)) return raw;
  return isLabelSize(fallback) ? fallback : DEFAULT_LABEL_SIZE;
}

export function labelSizeOf(key: unknown): LabelSize {
  return LABEL_SIZES.find((s) => s.key === key) ?? LABEL_SIZES[LABEL_SIZES.length - 1];
}

/** The word Shippo wants for this size. */
export function labelFileType(key: unknown): string {
  return labelSizeOf(key).token;
}

/** Short name for a box line, e.g. "4 × 6 in". */
export function labelSizeShort(key: unknown): string {
  return labelSizeOf(key).name.replace(/\s*\(.*\)\s*$/, "");
}
