// What a person may pick on a manual quotation line (pure). The Add-item form already hides the wrong choices; this is the same
// rule kept on the server, so a changed form, an old tab or a script can't price a line with a condition or expiry that product
// doesn't offer. A line that already has a value may keep it when only the quantity (or price) is corrected.

export const CUSTOM_CONDITION = "__custom__";

export type LineChoiceFacts = {
  /** A free-text line (no product) is not checked. */
  hasProduct: boolean;
  neverExpires: boolean;
  conditionId: string | null;
  expirationRangeId: string | null;
  /** The picked condition exists, is active, and is on the product's list (or the product has no list, so any active one is on offer). */
  conditionOffered: boolean;
  /** The same for the expiry range. */
  rangeOffered: boolean;
  /** Editing an existing line: the value being sent is the one it already has. */
  conditionUnchanged?: boolean;
  rangeUnchanged?: boolean;
};

export function lineChoiceError(f: LineChoiceFacts): string | null {
  if (!f.hasProduct) return null;
  if (!f.conditionId) {
    if (!f.conditionUnchanged) return "Choose a condition for this product.";
  } else if (f.conditionId !== CUSTOM_CONDITION && !f.conditionOffered && !f.conditionUnchanged) {
    return "That condition isn't offered for this product.";
  }
  if (f.neverExpires) return null;
  if (!f.expirationRangeId) {
    if (!f.rangeUnchanged) return "Choose an expiry for this product.";
  } else if (!f.rangeOffered && !f.rangeUnchanged) {
    return "That expiry isn't offered for this product.";
  }
  return null;
}
