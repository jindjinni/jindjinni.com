// Customer Service rules, pure and testable: what must be true before a customer email can go out, how the
// "To Be Emailed" / "Emailed" lists are grouped, and how a search matches. Nothing here reads the database.

import { localDayOfUtc, sumAmounts } from "@/lib/accounts-rules";

/** The facts about one paid order that decide whether its email can be sent. */
export type ReadinessInput = {
  emailsEnabled: boolean;
  /** Every email tells customers where to submit new orders, so the website link must be set. */
  hasWebsiteLink: boolean;
  /** Set when the connected mailbox stopped working and must be reconnected; null when sending can go ahead. */
  senderProblem: string | null;
  /** The customer's email address on the order. */
  toEmail: string | null;
  status: "IN_PROGRESS" | string;
  accountsStatus: string | null;
  hasPaymentReceipt: boolean;
  adjustmentNeeded: "YES" | "NO" | null;
  /** The agent's note for the customer (Step 8). */
  customerNote: string | null;
  adjustmentDetails: string | null;
  adjustedOrderTotal: number | null;
  adjustmentAmountEmail: number | null;
  /** A revised invoice photo, or a finalized adjustment quotation. */
  hasRevisedInvoice: boolean;
  /** The agent can write the whole email themselves (feature `cs-email-edit`), so a missing note is not a reason to stop. */
  emailEditable?: boolean;
  /** The template the agent chose (feature `cs-email-edit`). The adjustment checks follow the template that will be sent. */
  template?: string;
};

export type Readiness = {
  /** Plain-language reasons the email cannot be sent yet. Empty = ready. */
  blockers: string[];
  ready: boolean;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmailAddress = (v: string | null | undefined) => !!v && EMAIL_RE.test(v.trim());

/** Everything that must be fixed before the payment email can be sent, in the order someone would fix it. */
export function emailReadiness(i: ReadinessInput): Readiness {
  const blockers: string[] = [];
  if (!i.emailsEnabled) blockers.push("Customer emails are turned off. An Admin can turn them on in Email Settings.");
  if (!i.hasWebsiteLink) blockers.push("The website link isn't set. An Admin adds it in Email Settings (every email tells customers where to submit new orders).");
  if (i.senderProblem) blockers.push(i.senderProblem);
  if (i.status === "IN_PROGRESS") blockers.push("Receiving hasn't submitted this order yet.");
  if (i.accountsStatus !== "PAID") blockers.push("This order isn't marked Paid yet.");
  if (!isEmailAddress(i.toEmail)) blockers.push("This customer has no valid email address on the order.");
  if (!i.hasPaymentReceipt) blockers.push("Accounts hasn't attached the payment receipt yet.");
  // With no template chosen the order's own answer decides (as always); a chosen template decides for itself.
  const adjustmentEmail = i.template ? isAdjustmentTemplate(i.template) : i.adjustmentNeeded === "YES";
  if (adjustmentEmail) {
    if (!i.emailEditable && !(i.customerNote ?? "").trim() && !(i.adjustmentDetails ?? "").trim()) {
      blockers.push("Write what the adjustment is for in the note to the customer.");
    }
    if (i.adjustedOrderTotal == null && i.adjustmentAmountEmail == null) {
      blockers.push("Receiving hasn't entered the adjusted payout (Step 7) yet.");
    }
    if (!i.hasRevisedInvoice) blockers.push("The revised invoice (adjusted quotation) isn't attached yet.");
  }
  return { blockers, ready: blockers.length === 0 };
}

/**
 * Things worth a second look when the agent picks a template other than the one the order calls for. They never stop
 * a send (the agent may mean it); they are shown next to the picker so the choice is deliberate.
 */
export function templateWarnings(i: { template: string; recommended: string; adjustmentNeeded: "YES" | "NO" | null; packagingNotAcceptable: boolean }): string[] {
  const out: string[] = [];
  const adjustmentEmail = isAdjustmentTemplate(i.template);
  const packagingEmail = i.template === "STANDARD_PACKAGING_NOTICE" || i.template === "ADJUSTMENT_PACKAGING";
  if (i.template !== i.recommended) out.push(`This isn't the template the order calls for (${TEMPLATE_LABEL[i.recommended] ?? i.recommended}). Check the wording before you send.`);
  if (i.adjustmentNeeded === "YES" && !adjustmentEmail) out.push("Receiving marked an adjustment on this order, but this email tells the customer nothing was adjusted.");
  if (i.adjustmentNeeded !== "YES" && adjustmentEmail) out.push("Receiving didn't mark an adjustment on this order, but this email tells the customer one was made.");
  if (i.packagingNotAcceptable && !packagingEmail && i.template !== "ADJUSTMENT_SEPARATE") out.push("The packaging was marked not acceptable, but this email doesn't mention it.");
  if (!i.packagingNotAcceptable && packagingEmail) out.push("The packaging was acceptable, but this email tells the customer it wasn't.");
  return out;
}

// ---- sending the payment email by itself (feature `auto-payment-email`) -----

export type AutoSendInput = {
  /** The feature is on for this company. */
  featureOn: boolean;
  /** The company's own switch in Email Settings (on unless an admin turned it off). */
  settingOn: boolean;
  /** The customer has already been told about this order. */
  alreadyEmailed: boolean;
  /** The same readiness check the manual Send uses, worked out right after the order was marked Paid. */
  readiness: Readiness;
};

export type AutoSendDecision =
  | { action: "send" }
  /** `quiet` = nothing to tell Accounts (the feature or the switch is off, or the customer was already emailed). */
  | { action: "hold"; quiet: boolean; message: string };

/**
 * Whether the payment email goes out by itself the moment Accounts marks an order Paid. It sends only when everything the manual Send needs is
 * already true, so an automatic email is never different from one an agent would have been allowed to send. Anything else waits in
 * Customer Service -> To Be Emailed, with the reason.
 */
export function autoSendDecision(i: AutoSendInput): AutoSendDecision {
  if (!i.featureOn || !i.settingOn) return { action: "hold", quiet: true, message: "" };
  if (i.alreadyEmailed) return { action: "hold", quiet: true, message: "" };
  if (!i.readiness.ready) {
    return { action: "hold", quiet: false, message: `Marked Paid. The customer email was not sent automatically: ${i.readiness.blockers.join(" ")} It is waiting in Customer Service, To Be Emailed.` };
  }
  return { action: "send" };
}

// ---- the two lists ----------------------------------------------------------

/** One order in either list. */
export type CsOrder = {
  id: string;
  quotationNumber: string;
  customerName: string;
  email: string | null;
  /** When Accounts marked it paid (UTC timestamp text). */
  paidAt: string | null;
  /** When the customer was last emailed, if ever (UTC timestamp text). */
  emailedAt: string | null;
  /** How the order was handled: which of the four emails applies. */
  template: string;
  /** Final payout (the adjusted total when Receiving set one). */
  amount: number;
  adjusted: boolean;
  /** Ready to send, or what is still missing (only for To Be Emailed). */
  blockers: string[];
  emailCount: number;
  /** Feature `order-tags`: someone messaged the customer on Facebook. Undefined when the tags are off. */
  facebook?: boolean;
};

/** The four "package received & processed" emails an agent can choose between (the packaging warning is sent on its own). */
export const STATUS_TEMPLATE_KEYS = ["STANDARD", "STANDARD_PACKAGING_NOTICE", "ADJUSTMENT_ONLY", "ADJUSTMENT_PACKAGING", "ADJUSTMENT_SEPARATE"] as const;

export const isAdjustmentTemplate = (key: string) => key === "ADJUSTMENT_ONLY" || key === "ADJUSTMENT_PACKAGING" || key === "ADJUSTMENT_SEPARATE";

export const TEMPLATE_LABEL: Record<string, string> = {
  STANDARD: "Standard",
  STANDARD_PACKAGING_NOTICE: "Packaging notice",
  ADJUSTMENT_ONLY: "Adjustment",
  ADJUSTMENT_PACKAGING: "Adjustment + packaging",
  ADJUSTMENT_SEPARATE: "Adjustment (packaging sent separately)",
  PACKAGING_WARNING: "Packaging warning",
};

/** Search over name, quotation number and email. */
export function csMatches(o: Pick<CsOrder, "customerName" | "quotationNumber" | "email">, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [o.customerName, o.quotationNumber, o.email ?? ""].some((v) => v.toLowerCase().includes(t));
}

export type DayGroup<T> = { day: string; orders: T[]; total: number };

/** Groups orders under a day; `dayFor` says which day an order belongs to. Orders with no day go last under "". */
export function groupOrdersByDay<T extends { amount: number }>(orders: T[], dayFor: (o: T) => string, newestFirst: boolean): DayGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const o of orders) {
    const d = dayFor(o);
    by.set(d, [...(by.get(d) ?? []), o]);
  }
  const days = [...by.keys()].filter((d) => d !== "").sort();
  if (newestFirst) days.reverse();
  if (by.has("")) days.push("");
  return days.map((day) => {
    const list = by.get(day)!;
    return { day, orders: list, total: sumAmounts(list) };
  });
}

/** To Be Emailed: under the day each order was paid, the longest-waiting day first. Day = the viewer's own calendar day. */
export const groupWaiting = (orders: CsOrder[]) => groupOrdersByDay(orders, (o) => localDayOfUtc(o.paidAt), false);

/** Emailed: under the day the email went out, newest day first. */
export const groupEmailed = (orders: CsOrder[]) => groupOrdersByDay(orders, (o) => localDayOfUtc(o.emailedAt), true);
