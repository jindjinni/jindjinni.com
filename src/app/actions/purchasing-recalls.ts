"use server";

// The quick recall check in Purchasing: before a quotation is given, type the lot or serial number a customer sent
// and see whether it is on a recall list. Read-only: nothing is saved, so it can be used as often as needed.
// Scoped by the signed-in user's company; the lists themselves are managed by an admin in Receiving (Step 6).

import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing } from "@/lib/permissions";
import { loadIndex } from "@/lib/receiving-recall-service";
import { matchNumber, numbersToCheck } from "@/lib/receiving-recall";

export type QuickRecallResult = {
  error?: string;
  results?: { number: string; recalls: string[] }[];
  recalled?: boolean;
};

export async function quickRecallLookup(input: string): Promise<QuickRecallResult> {
  const org = await requireOrg();
  if (!canViewPurchasing(org.role)) throw new Error("Your role can't use the Purchasing recall check.");
  const numbers = numbersToCheck(String(input ?? "").slice(0, 600));
  if (numbers.length === 0) return { error: "Enter a lot or serial number (at least 4 letters or digits)." };
  if (numbers.length > 12) return { error: "Check up to 12 numbers at a time." };
  const index = await loadIndex(org.organizationId);
  const results = numbers.map((n) => ({ number: n, recalls: matchNumber(n, index).map((m) => m.recallName) }));
  return { results, recalled: results.some((r) => r.recalls.length > 0) };
}
