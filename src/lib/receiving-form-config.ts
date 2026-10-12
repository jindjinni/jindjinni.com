// What a company changed on its Receiving Intake Form. Pure; reads and writes nothing.
//
// A company can (1) hide a photo type or a question it never uses, and (2) keep a question but stop requiring it before a shipment
// can be submitted. Hiding only takes it off the form: photos and answers already saved stay in the record, and nothing is deleted.
// The things that decide what a shipment is (product lines, quantities, lots, expirations, recall checks, the accounts steps) can't be changed.

import type { PhotoKind } from "@/lib/receiving-rules";

/** Photo types that belong to the package as a whole (never the per-product photos or the accounts documents). */
export const HIDEABLE_PHOTOS = [
  { key: "UNOPENED_PACKAGE", label: "Photo - Unopened Package" },
  { key: "SHIPPING_LABEL", label: "Photo - Shipping Label" },
  { key: "DAMAGE", label: "Damage Photos (when there is external damage)" },
  { key: "PACKAGE_AS_OPENED", label: "Photo - Package As Opened" },
  { key: "PACKAGING_ISSUE", label: "Packaging Issue Photos (when packaging is not acceptable)" },
  { key: "COMPLETE_CONTENTS", label: "Photo - Complete Contents" },
  { key: "PACKING_SHEET", label: "Invoice / Packing Sheet Photo" },
] as const satisfies readonly { key: PhotoKind; label: string }[];
export type HideablePhoto = (typeof HIDEABLE_PHOTOS)[number]["key"];

/** Questions that are never required, so a company that does not use them can hide them. */
export const HIDEABLE_FIELDS = [
  { key: "carrier", label: "Carrier" },
  { key: "doubleBoxed", label: "Double-Boxed?" },
  { key: "protectiveMaterial", label: "Bubble Wrap / Protective Material?" },
  { key: "sturdyOuterBox", label: "Sturdy Outer Box?" },
  { key: "productsSecured", label: "Products Properly Secured?" },
  { key: "packageSealed", label: "Package Properly Sealed?" },
  { key: "packagingRequirementsMet", label: "Packaging Requirements Met?" },
  { key: "packingSheetIncluded", label: "Invoice / Packing Sheet Included?" },
] as const;
export type HideableField = (typeof HIDEABLE_FIELDS)[number]["key"];

/** Questions that stay on the form, but a shipment can be submitted without answering them. */
export const OPTIONAL_FIELDS = [
  { key: "overallPackaging", label: "Overall Packaging Condition" },
  { key: "quantityMatches", label: "Does Quantity Match What Was Quoted?" },
  { key: "adjustmentNeeded", label: "Adjustment Needed?" },
  { key: "receivingNotes", label: "Receiving Notes" },
] as const;
export type OptionalField = (typeof OPTIONAL_FIELDS)[number]["key"];

export type ReceivingFormConfig = { hiddenPhotos: HideablePhoto[]; hiddenFields: HideableField[]; optional: OptionalField[] };

export const STANDARD_FORM: ReceivingFormConfig = { hiddenPhotos: [], hiddenFields: [], optional: [] };

const PHOTO_KEYS: ReadonlySet<string> = new Set(HIDEABLE_PHOTOS.map((p) => p.key));
const FIELD_KEYS: ReadonlySet<string> = new Set(HIDEABLE_FIELDS.map((f) => f.key));
const OPTIONAL_KEYS: ReadonlySet<string> = new Set(OPTIONAL_FIELDS.map((f) => f.key));

const keep = <T extends string>(v: unknown, allowed: ReadonlySet<string>): T[] =>
  Array.isArray(v) ? ([...new Set(v.filter((x): x is string => typeof x === "string" && allowed.has(x)))] as T[]) : [];

/** Reads what was saved or submitted; anything unknown or malformed is ignored (so the standard form shows). */
export function cleanFormConfig(raw: unknown): ReceivingFormConfig {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  if (!v || typeof v !== "object") return { ...STANDARD_FORM, hiddenPhotos: [], hiddenFields: [], optional: [] };
  const o = v as Record<string, unknown>;
  return { hiddenPhotos: keep<HideablePhoto>(o.hiddenPhotos, PHOTO_KEYS), hiddenFields: keep<HideableField>(o.hiddenFields, FIELD_KEYS), optional: keep<OptionalField>(o.optional, OPTIONAL_KEYS) };
}

/** What to store: null when it is the standard form. */
export function serializeFormConfig(c: ReceivingFormConfig): string | null {
  const x = cleanFormConfig(c);
  return x.hiddenPhotos.length + x.hiddenFields.length + x.optional.length === 0 ? null : JSON.stringify(x);
}

export const photoHidden = (c: ReceivingFormConfig | null | undefined, kind: string) => !!c && c.hiddenPhotos.includes(kind as HideablePhoto);
export const fieldHidden = (c: ReceivingFormConfig | null | undefined, key: HideableField) => !!c && c.hiddenFields.includes(key);
export const fieldOptional = (c: ReceivingFormConfig | null | undefined, key: OptionalField) => !!c && c.optional.includes(key);
