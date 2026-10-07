// Colors for the Inventory screens. Mint and Dinged must look different, so neither uses amber (this department's
// color theme re-paints amber and emerald in its own accent, which would make them look alike).

const COND: Record<string, string> = {
  mint: "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-100",
  dinged: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
};

/** Chip classes for a condition name. */
export const conditionChip = (c: string) => COND[c.toLowerCase()] ?? "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100";
