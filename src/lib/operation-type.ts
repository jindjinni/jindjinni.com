// How a company operates in the medical-supply trade. Asked once at sign-up (required) and changeable later by the owner or an
// admin in Settings -> Company profile. It decides which Purchasing documents the company gets:
//   Wholesaler  -> buys from individuals and sells on to distributors: gives quotations (and often a free shipping label).
//   Distributor -> buys from wholesalers and sells to pharmacies and other established retailers: sends purchase orders.
//   Both        -> both kinds of document.
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

/** Does this company send purchase orders to its suppliers? Only distributors and companies that do both. Unanswered = no. */
export const sendsPurchaseOrders = (type: OperationType | null | undefined) => type === "DISTRIBUTOR" || type === "BOTH";

/**
 * Does this company give quotations to people selling to it? Wholesalers and "both", and any company that has not answered
 * yet (so nothing that worked before stops working).
 */
export const givesQuotations = (type: OperationType | null | undefined) => type !== "DISTRIBUTOR";
