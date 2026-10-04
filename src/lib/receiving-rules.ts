// Receiving rules -- pure functions, no database. What a shipment still needs
// before it can be submitted ("Missing Info" in the old Airtable), and what the
// final status should be.

import type { RECEIVING_PHOTO_KINDS } from "@/db/schema";

export type PhotoKind = (typeof RECEIVING_PHOTO_KINDS)[number];

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  UNOPENED_PACKAGE: "Photo - Unopened Package",
  SHIPPING_LABEL: "Photo - Shipping Label",
  DAMAGE: "Damage Photos",
  PACKAGE_AS_OPENED: "Photo - Package As Opened",
  PACKAGING_ISSUE: "Packaging Issue Photos",
  COMPLETE_CONTENTS: "Photo - Complete Contents",
  PACKING_SHEET: "Invoice / Packing Sheet Photo",
};

export const MAX_PHOTOS_PER_KIND = 10;

export const DAMAGE_TYPES = ["Crushed", "Torn", "Wet", "Open", "Punctured", "Tape Damage", "Box Damage", "Other"] as const;

export const STATUS_LABELS = {
  IN_PROGRESS: "In Progress",
  RECEIVING_COMPLETE: "Receiving Complete",
  RECEIVING_COMPLETE_WITH_DISCREPANCY: "Complete With Discrepancy",
} as const;

export type ShipmentFacts = {
  receivedAt?: string | null;
  externalDamage?: string | null;
  damageTypes?: string[];
  doubleBoxed?: string | null;
  protectiveMaterial?: string | null;
  sturdyOuterBox?: string | null;
  productsSecured?: string | null;
  packageSealed?: string | null;
  packagingRequirementsMet?: string | null;
  overallPackaging?: string | null;
  packagingIssueNotes?: string | null;
  packingSheetIncluded?: string | null;
  quantityMatches?: string | null;
  adjustmentNeeded?: string | null;
  adjustmentDetails?: string | null;
};

const blank = (v: string | null | undefined) => !v || !v.trim();

/** Everything still missing, in the order the form asks for it. Empty = ready to submit. */
export function computeMissingInfo(s: ShipmentFacts, photoCounts: Partial<Record<PhotoKind, number>>): string[] {
  const n = (k: PhotoKind) => photoCounts[k] ?? 0;
  const out: string[] = [];
  if (blank(s.receivedAt)) out.push("Date/Time Received");
  if (n("UNOPENED_PACKAGE") < 1) out.push(PHOTO_KIND_LABELS.UNOPENED_PACKAGE);
  if (n("SHIPPING_LABEL") < 1) out.push(PHOTO_KIND_LABELS.SHIPPING_LABEL);
  if (!s.externalDamage) out.push("External Damage?");
  if (s.externalDamage === "YES") {
    if (!s.damageTypes || s.damageTypes.length === 0) out.push("Damage Type");
    if (n("DAMAGE") < 1) out.push(PHOTO_KIND_LABELS.DAMAGE);
  }
  if (n("PACKAGE_AS_OPENED") < 1) out.push(PHOTO_KIND_LABELS.PACKAGE_AS_OPENED);
  if (!s.doubleBoxed) out.push("Double-Boxed?");
  if (!s.protectiveMaterial) out.push("Bubble Wrap / Protective Material Used?");
  if (!s.sturdyOuterBox) out.push("Sturdy Outer Box Used?");
  if (!s.productsSecured) out.push("Products Properly Secured?");
  if (!s.packageSealed) out.push("Package Properly Sealed?");
  if (!s.packagingRequirementsMet) out.push("Packaging Requirements Met?");
  if (!s.overallPackaging) out.push("Overall Packaging Condition");
  if (s.overallPackaging === "NOT_ACCEPTABLE") {
    if (blank(s.packagingIssueNotes)) out.push("Packaging Issue Notes");
    if (n("PACKAGING_ISSUE") < 1) out.push(PHOTO_KIND_LABELS.PACKAGING_ISSUE);
  }
  if (n("COMPLETE_CONTENTS") < 1) out.push(PHOTO_KIND_LABELS.COMPLETE_CONTENTS);
  if (!s.packingSheetIncluded) out.push("Invoice / Packing Sheet Included?");
  if (s.packingSheetIncluded === "YES" && n("PACKING_SHEET") < 1) out.push(PHOTO_KIND_LABELS.PACKING_SHEET);
  if (!s.quantityMatches) out.push("Does Quantity Match What Was Quoted?");
  if (!s.adjustmentNeeded) out.push("Adjustment Needed?");
  if (s.adjustmentNeeded === "YES" && blank(s.adjustmentDetails)) out.push("Adjustment Details");
  return out;
}

/** Clean vs. discrepancy: anything that differs from what was quoted or arrived badly makes it a discrepancy. */
export function finalStatusFor(s: ShipmentFacts): "RECEIVING_COMPLETE" | "RECEIVING_COMPLETE_WITH_DISCREPANCY" {
  const discrepancy =
    s.externalDamage === "YES" ||
    s.overallPackaging === "NOT_ACCEPTABLE" ||
    s.quantityMatches === "NO" ||
    s.adjustmentNeeded === "YES";
  return discrepancy ? "RECEIVING_COMPLETE_WITH_DISCREPANCY" : "RECEIVING_COMPLETE";
}

export function parseDamageTypes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
