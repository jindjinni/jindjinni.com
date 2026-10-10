// Which tabs each operation shows. Pure: no database, no clock, easy to test.
//
// A Wholesale operation buys from individuals (quotation, free shipping label, package checking) and sells to distributors.
// A Distribution operation buys from wholesalers (the wholesaler sends an invoice, the distributor sends back a purchase order)
// and sells to pharmacies and other retail outlets. So each operation hides the tabs that belong only to the other one's way of
// working. Hiding is only the menu: every page still opens by its address and no record is ever removed. An owner or admin can
// switch "show every tab" on for an operation. A company that has not named its operation yet, or runs both sides in one
// workspace, hides nothing.

import type { MenuDept } from "@/lib/sidebar-menu";
import type { Sides } from "@/lib/operations-rules";

type Hidden = Partial<Record<MenuDept, string[]>>;

/** Tab ids a Wholesale operation does not need: buying from companies with purchase orders. */
export const WHOLESALE_HIDDEN: Hidden = {
  purchasing: ["purchase-orders", "suppliers"],
};

/** Tab ids a Distribution operation does not need: quoting individuals and everything that prices a package from an individual. */
export const DISTRIBUTION_HIDDEN: Hidden = {
  purchasing: ["quotations", "customers", "conditions", "month-range", "product-multipliers", "bonus-tiers", "quotation-profile", "receipt-layout"],
  receiving: ["adjustments"],
};

/** Tab ids that exist only in a Distribution operation (a Wholesale operation never shows them, "show every tab" or not). */
export const DISTRIBUTION_ONLY: Hidden = {
  accounts: ["audit-center"],
};

/** The one side a workspace is, or null when it is both (or has not chosen): then nothing is hidden. */
export function singleSide(sides: Sides): "wholesale" | "distribution" | null {
  if (sides.wholesale && !sides.distribution) return "wholesale";
  if (sides.distribution && !sides.wholesale) return "distribution";
  return null;
}

/** The tab ids to leave out of a department's menu for this workspace. */
export function hiddenTabIds(sides: Sides, dept: MenuDept, showAll: boolean): string[] {
  // A distribution-only tab is not part of a workspace that has no Distribution side: switching "show every tab" on does not add it.
  const notHere = sides.distribution ? [] : DISTRIBUTION_ONLY[dept] ?? [];
  if (showAll) return notHere;
  const side = singleSide(sides);
  if (!side) return notHere;
  return [...((side === "wholesale" ? WHOLESALE_HIDDEN : DISTRIBUTION_HIDDEN)[dept] ?? []), ...notHere];
}

/** A department's menu ids with the hidden ones taken out (the list is built from `all` when no list was given). */
export function withoutHidden(all: string[], sides: Sides, dept: MenuDept, showAll: boolean): string[] {
  const gone = new Set(hiddenTabIds(sides, dept, showAll));
  return all.filter((id) => !gone.has(id));
}

/** True when this workspace hides anything at all (so Settings can offer the "show every tab" switch). */
export function hidesTabs(sides: Sides): boolean {
  return singleSide(sides) !== null;
}

/** The plain words under the "Purchasing" title on the Purchasing home, for the operation. */
export function purchasingBlurb(sides: Sides): string {
  const side = singleSide(sides);
  if (side === "distribution") return "Send purchase orders to your suppliers, keep the product list, and follow each order until it arrives.";
  if (side === "wholesale") return "Quote individuals, manage the product catalog, and track quotations through to the shared Overall Orders record.";
  return "Quote customers, manage the product catalog, and track quotations through to the shared Overall Orders record.";
}

/** The step-by-step day of each operation, in plain words (shown in Settings → Operations and told to Jin). */
export const SIDE_FLOW: Record<"wholesale" | "distribution", string[]> = {
  wholesale: [
    "An individual wants to sell supplies: you send a quotation, with a free shipping label if you offer one.",
    "The package arrives. Receiving checks it and records what was really inside.",
    "If something differs, you send a corrected (adjustment) quotation. Then Accounts pays the individual.",
    "You sell on to distributors: they send you a purchase order, you send them an invoice.",
  ],
  distribution: [
    "A wholesaler sends you an invoice (a price offer) for what you want.",
    "You send them back a purchase order. If something is wrong, you send a revision.",
    "The goods arrive and Receiving checks them against the order.",
    "You sell to pharmacies and other retail outlets: they send you a purchase order, you send them an invoice.",
  ],
};
