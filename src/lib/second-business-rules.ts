// Wholesale and Distribution can be one business entity (one LLC) or two. When they are two, the second one is verified just like
// the first: its own EIN, state, state file number, year formed, kind of business and proof document, reviewed by the platform
// owner, and its operation stays locked until that review says yes. Pure rules, no database.

/** The prefix every field of the second business carries in a form, so one form can hold both sets of papers. */
export const SECOND_PREFIX = "second_";

export type SameBusiness = "same" | "different";

/** The answer to "is it the same LLC?" from a form, or null when it is missing or not one of the two. */
export function parseSameBusiness(value: unknown): SameBusiness | null {
  const v = String(value ?? "").trim();
  return v === "same" || v === "different" ? v : null;
}

export const SAME_BUSINESS_QUESTION = "Are your Wholesale business and your Distribution business the same LLC (the same business entity)?";
export const SAME_BUSINESS_SAME = "Yes, one business entity, one EIN";
export const SAME_BUSINESS_DIFFERENT = "No, they are two different businesses (two LLCs or companies)";
export const SAME_BUSINESS_HELP =
  "If they are two different businesses, we check both of them the same way: each needs its own EIN, state file number and proof document. The second one stays locked until we have checked it. Your first operation works normally in the meantime.";
export const SAME_BUSINESS_REQUIRED = "Tell us whether your Wholesale and Distribution businesses are the same LLC.";

/** Words for the second operation's review state, for the company itself. */
export function secondBusinessStatusText(status: string | null): { label: string; text: string } {
  switch (status) {
    case "pending": return { label: "Waiting for review", text: "We are checking the second business. That operation opens as soon as it is approved. Your other operation works normally." };
    case "rejected": return { label: "Not approved yet", text: "We could not confirm the second business from the details we have. Fix what we asked for and send them again." };
    case "suspended": return { label: "Suspended", text: "This operation is switched off. Your other operation works normally. Please contact support." };
    case "banned": return { label: "Closed", text: "This operation was closed under our Terms and Conditions. Your other operation works normally." };
    case "approved": return { label: "Approved", text: "The second business is verified. Both operations are open." };
    default: return { label: "Same business", text: "Both operations are the same business, so one verification covers both." };
  }
}

export type Papers = { ein: string; registeredState: string; stateFileNumber: string };

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The plain reason the second business's papers cannot be accepted next to the first's, or null. Two different businesses never
 * share an EIN, and never share a state file number within the same state: if they do, it is the same business.
 */
export function distinctFromFirst(first: Papers, second: Papers): string | null {
  if (first.ein && squash(first.ein) === squash(second.ein)) {
    return "The second business has the same EIN as the first. Two different businesses each have their own EIN. If both are really the same business, choose \"the same LLC\" instead.";
  }
  if (first.registeredState === second.registeredState && squash(first.stateFileNumber) === squash(second.stateFileNumber)) {
    return "The second business has the same state file number as the first. Two different businesses each have their own. If both are really the same business, choose \"the same LLC\" instead.";
  }
  return null;
}

/** An operation row with its own approval status is a separate business; one without shares the company's. */
export function isSeparateBusiness(status: string | null): boolean {
  return status !== null && status !== undefined && status !== "";
}

/** True when this operation's own review keeps it locked (waiting, turned down, suspended or banned). */
export function operationHeld(parent: string | null, ownStatus: string | null): boolean {
  if (!parent) return false;
  return ownStatus === "pending" || ownStatus === "rejected" || ownStatus === "suspended" || ownStatus === "banned";
}
