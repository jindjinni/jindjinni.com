// The real condition/payout-percentage pairs (per chat, 2026-10-04, from the
// "Manage Conditions" screenshot). Only these two are confirmed real values --
// everything else (Scratched, Damaged, etc.) is left for the user to add
// themselves with their own real payout percentage, same as Month Range's
// duplicate-label rows were flagged instead of guessed.
export const purchasingConditionCatalog: { name: string; multiplier: number }[] = [
  { name: "Mint Only - No Damages", multiplier: 1.0 },
  { name: "Ding (Tape Over Label, Dents, Label Residues)", multiplier: 0.8 },
];
