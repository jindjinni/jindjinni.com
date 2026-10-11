// Direct-deposit details a seller gives for being paid (routing number, account number, account type, and the name of the business owner who
// holds the account). Pure rules (no database, no encryption), so they can be tested alone. The details are stored encrypted (bank-crypto.ts)
// and only people allowed to see them can reveal them (permissions: canRevealBankDetails). Nothing here ever logs or returns a full number.

export const ACCOUNT_TYPES = ["checking", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type PayoutInput = { ownerName: unknown; routingNumber: unknown; accountNumber: unknown; accountType: unknown };
export type Payout = { ownerName: string; routingNumber: string; accountNumber: string; accountType: AccountType };

/** A US bank routing number (ABA): 9 digits whose weighted sum (3,7,1 repeating) is a multiple of 10. Catches mistyped numbers, nothing more. */
export function routingOk(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split("").map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

export const last4 = (digits: string) => digits.slice(-4);

/** Checks and cleans a seller's direct-deposit details. The messages are for the person filling the form, and never repeat a number back. */
export function cleanPayout(input: PayoutInput): { ok: true; value: Payout } | { ok: false; error: string } {
  const ownerName = String(input.ownerName ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 100);
  if (ownerName.length < 2) return { ok: false, error: "Enter the name of the business owner the bank account belongs to." };
  if (/\d/.test(ownerName)) return { ok: false, error: "The owner's name should not contain numbers." };
  const routingNumber = String(input.routingNumber ?? "").replace(/[\s-]/g, "");
  if (!routingOk(routingNumber)) return { ok: false, error: "That routing number doesn't look right. It has 9 digits; please check it." };
  const accountNumber = String(input.accountNumber ?? "").replace(/[\s-]/g, "");
  if (!/^\d{4,17}$/.test(accountNumber)) return { ok: false, error: "That account number doesn't look right. It has 4 to 17 digits; please check it." };
  const accountType = String(input.accountType ?? "").trim().toLowerCase();
  if (!(ACCOUNT_TYPES as readonly string[]).includes(accountType)) return { ok: false, error: "Choose whether the account is checking or savings." };
  return { ok: true, value: { ownerName, routingNumber, accountNumber, accountType: accountType as AccountType } };
}

/** What is stored encrypted. */
export const payoutToJson = (p: Payout) => JSON.stringify({ n: p.ownerName, r: p.routingNumber, a: p.accountNumber, t: p.accountType });
export function payoutFromJson(text: string): Payout | null {
  try {
    const v = JSON.parse(text) as { n?: unknown; r?: unknown; a?: unknown; t?: unknown };
    if (typeof v.n !== "string" || typeof v.r !== "string" || typeof v.a !== "string" || (v.t !== "checking" && v.t !== "savings")) return null;
    return { ownerName: v.n, routingNumber: v.r, accountNumber: v.a, accountType: v.t };
  } catch {
    return null;
  }
}

/** The only thing most people ever see: "Checking account ending 1234". */
export const maskedLine = (type: string, accountLast4: string) => `${type === "savings" ? "Savings" : "Checking"} account ending ${accountLast4}`;
