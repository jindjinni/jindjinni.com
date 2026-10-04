// The real Month Range / multiplier table (per chat, 2026-10-04). Two label
// pairs repeat on purpose with different multipliers -- "5-6 months" and
// "8-11 months" -- confirmed by the user as intentional, separate entries
// (e.g. different grading/condition cutoffs sharing the same month label),
// not a data-entry mistake. Kept as 17 distinct rows, not deduped by label.
export const purchasingMonthRangeCatalog: {
  label: string;
  minMonths: number | null;
  maxMonths: number | null;
  defaultMultiplier: number;
}[] = [
  { label: "1-2 months", minMonths: 1, maxMonths: 2, defaultMultiplier: 0.3 },
  { label: "3-5 months", minMonths: 3, maxMonths: 5, defaultMultiplier: 0.5 },
  { label: "4+ months", minMonths: 4, maxMonths: null, defaultMultiplier: 1.0 },
  { label: "5+ months", minMonths: 5, maxMonths: null, defaultMultiplier: 1.0 },
  { label: "5-6 months", minMonths: 5, maxMonths: 6, defaultMultiplier: 0.5 },
  { label: "5-6 months", minMonths: 5, maxMonths: 6, defaultMultiplier: 0.8 },
  { label: "5-7 months", minMonths: 5, maxMonths: 7, defaultMultiplier: 0.5 },
  { label: "6-7 months", minMonths: 6, maxMonths: 7, defaultMultiplier: 0.9 },
  { label: "6-8 months", minMonths: 6, maxMonths: 8, defaultMultiplier: 0.9 },
  { label: "7+ months", minMonths: 7, maxMonths: null, defaultMultiplier: 1.0 },
  { label: "7-9 months", minMonths: 7, maxMonths: 9, defaultMultiplier: 0.96 },
  { label: "8+ months", minMonths: 8, maxMonths: null, defaultMultiplier: 1.0 },
  { label: "8-11 months", minMonths: 8, maxMonths: 11, defaultMultiplier: 0.8 },
  { label: "8-11 months", minMonths: 8, maxMonths: 11, defaultMultiplier: 0.98 },
  { label: "9+ months", minMonths: 9, maxMonths: null, defaultMultiplier: 1.0 },
  { label: "10+ months", minMonths: 10, maxMonths: null, defaultMultiplier: 1.0 },
  { label: "12+ months", minMonths: 12, maxMonths: null, defaultMultiplier: 1.0 },
];
