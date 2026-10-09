// How a company operates in the medical-supply trade. Asked once at sign-up (required) and changeable later by the owner or an
// admin in Settings -> Company profile. Every company gets Quotations and Purchase Orders in both Purchasing and Sales; the
// answer sets which comes first:
//   Wholesaler  -> buys from individuals and sells on to distributors: quotations (and often a free shipping label) first.
//   Distributor -> buys from wholesalers and sells to pharmacies and other established retailers: purchase orders first.
//   Both        -> both, quotations first.
// A company that existed before this question was added has no answer saved (null). We never guess for it: it keeps
// everything it already had and sees a one-time prompt to answer.

export const OPERATION_TYPES = ["WHOLESALER", "DISTRIBUTOR", "BOTH"] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export type OperationOption = { value: OperationType; label: string; description: string };

export const OPERATION_OPTIONS: OperationOption[] = [
  {
    value: "WHOLESALER",
    label: "Wholesaler",
    description: "We source supplies from individuals and sell them back to distribution companies. We give quotations and sometimes provide a free shipping label.",
  },
  {
    value: "DISTRIBUTOR",
    label: "Distributor",
    description: "We sell to pharmacies and other established retail places that deal in medical supplies. We buy from wholesalers by sending purchase orders.",
  },
  {
    value: "BOTH",
    label: "Both",
    description: "We do both: we buy from individuals and from wholesalers, and we sell on to distributors and retailers.",
  },
];

export const OPERATION_QUESTION = "What type of operation do you run?";

/** The saved value, or null when it is empty or not one of the three. Never throws. */
export function parseOperationType(value: unknown): OperationType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return (OPERATION_TYPES as readonly string[]).includes(v) ? (v as OperationType) : null;
}

export function operationLabel(type: OperationType | null | undefined): string {
  return OPERATION_OPTIONS.find((o) => o.value === type)?.label ?? "Not answered yet";
}

/** Reads the answer from a form for sign-up; returns the plain message to show when it is missing. */
export function readRequiredOperationType(value: unknown): { ok: true; type: OperationType } | { ok: false; error: string } {
  const type = parseOperationType(value);
  return type ? { ok: true, type } : { ok: false, error: "Choose what type of operation you run: Wholesaler, Distributor or Both." };
}

/**
 * Every company gets both documents -- Quotations and Purchase Orders -- in Purchasing and in Sales. The answer to the sign-up
 * question only decides which one comes first (the default): a Distributor starts with Purchase Orders, a Wholesaler and a
 * company doing both start with Quotations, and a company that has not answered keeps Quotations first (nothing moves for it).
 */
export type DocType = "QUOTATION" | "PURCHASE_ORDER";
export const DOC_TYPES: DocType[] = ["QUOTATION", "PURCHASE_ORDER"];

export const DOC_LABEL: Record<DocType, string> = { QUOTATION: "Quotation", PURCHASE_ORDER: "Purchase Order" };

export function primaryDocument(type: OperationType | null | undefined): DocType {
  return type === "DISTRIBUTOR" ? "PURCHASE_ORDER" : "QUOTATION";
}

/** The two documents in the order a company with this answer sees them. */
export function documentOrder(type: OperationType | null | undefined): DocType[] {
  return primaryDocument(type) === "PURCHASE_ORDER" ? ["PURCHASE_ORDER", "QUOTATION"] : ["QUOTATION", "PURCHASE_ORDER"];
}

/** One plain sentence for Settings: what the answer means for the order of the documents. */
export function operationDefaultText(type: OperationType | null | undefined): string {
  if (type === "DISTRIBUTOR") return "Purchase Orders come first in Purchasing and Sales. Quotations are always there too.";
  if (type === "WHOLESALER") return "Quotations come first in Purchasing and Sales. Purchase Orders are always there too.";
  if (type === "BOTH") return "Quotations and Purchase Orders are both switched on, Quotations first.";
  return "Quotations and Purchase Orders are both available. Nothing has moved.";
}
