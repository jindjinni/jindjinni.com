// Which products always get the recall checker switched on the moment they are chosen (Purchasing quotation line,
// Receiving Step 6 row). Any product that matches one of the company's active recalls counts, and so does the whole
// Dexcom G7, Omnipod and FreeStyle Libre 3 / 3 Plus family even when no list is loaded for it yet: those are the
// products the receivers and purchasers must never take without checking. Everything else leaves the checker
// available but quiet. This only decides when the checker opens; the accept / return rules are unchanged.

import { recallsForProduct } from "@/lib/receiving-recall";

const ALWAYS_CHECK: RegExp[] = [/dexcom\s*g\s*7/i, /omnipod/i, /libre\s*3/i, /libre3/i];

export function needsRecallChecker(productName: string | null | undefined, recalls: { keywords: string; active?: boolean }[]): boolean {
  const name = String(productName ?? "").trim();
  if (!name) return false;
  if (ALWAYS_CHECK.some((re) => re.test(name))) return true;
  return recallsForProduct(name, recalls.filter((r) => r.active !== false)).length > 0;
}
