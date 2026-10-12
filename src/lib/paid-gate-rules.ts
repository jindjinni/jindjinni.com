// The one rule for "can this order be marked Paid?", and the one rule for "can it move to Need to Be Paid by itself?".
// Pure, so it is tested without a database. Every path that marks an order Paid (Accounts > Mark Paid, the Step 10 form,
// dragging a card on the board) asks paidBlocker() first.

export type PaidFacts = {
  /** Receiving was submitted (the shipment is not In Progress). */
  submitted: boolean;
  /** The shipment's Accounts Decision right now. */
  decision: string | null | undefined;
  /** A payment confirmation (receipt) photo is attached. */
  hasReceipt: boolean;
  /** Received rows the recall check marked RECALLED (those are held, not stock). */
  recalledLines: number;
  /** An adjustment quotation that is started but not finalised. */
  draftAdjustment: boolean;
  /** Received rows whose return decision is still "Pending Review". */
  pendingReturnLines: number;
};

/** Why the order can't be marked Paid yet, in plain words, or null when it can. */
export function paidBlocker(f: PaidFacts): string | null {
  if (!f.submitted) return "Receiving hasn't been submitted yet.";
  if (f.decision === "PAID") return null;
  if (f.recalledLines > 0) return `${f.recalledLines === 1 ? "A received product is" : `${f.recalledLines} received products are`} on hold for a recall. Resolve that before paying.`;
  if (f.draftAdjustment) return "An adjustment quotation is still a draft. Finish or delete it so the payout is final.";
  if (f.pendingReturnLines > 0) return "Some products are still waiting for a return decision.";
  if (f.decision !== "NEED_TO_BE_PAID") return "This order isn't waiting to be paid. Move it to Need to Be Paid first.";
  if (!f.hasReceipt) return "Attach the payment receipt first, then mark the order Paid.";
  return null;
}

export type AutoFacts = {
  status: string | null | undefined;
  decision: string | null | undefined;
  recalledLines: number;
  needsReturnLines: number;
  pendingReturnLines: number;
  draftAdjustment: boolean;
};

/** A clean, just-submitted shipment goes to Need to Be Paid by itself. Anything odd stays for a person to decide. */
export function autoNeedToBePaid(f: AutoFacts): boolean {
  if (f.decision && f.decision !== "UNCATEGORIZED") return false;
  if (f.status !== "RECEIVING_COMPLETE") return false;
  return f.recalledLines === 0 && f.needsReturnLines === 0 && f.pendingReturnLines === 0 && !f.draftAdjustment;
}
