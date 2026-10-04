// Brand-level expiry-option rules for the Purchasing product catalog (per
// chat, 2026-10-04). Instead of ticking month ranges product by product, a
// Purchasing Manager can apply these in one click from the Product
// Multipliers page. Each rule says which products it covers (by name /
// category) and which month ranges those products get, with the payout
// (price multiplier) that range carries.
//
// Pure data + matching only -- no database access -- so the page preview and
// the apply action share exactly the same logic.

export type ExpiryOption = {
  label: string;
  minMonths: number | null;
  maxMonths: number | null;
  /** Payout as a multiplier of the standard price: 1 = 100%, 0.5 = 50%. */
  multiplier: number;
};

export type ExpiryRule = {
  key: string;
  title: string;
  /** Plain-language description of which products this covers. */
  covers: string;
  /** True for products that never expire -- they get no month ranges at all. */
  noExpiration?: boolean;
  options: ExpiryOption[];
  matches: (product: { name: string; categoryName: string | null }) => boolean;
};

// Anything that is NOT a test strip even if it carries a strip brand's name.
const NOT_A_STRIP = /lancet|delica|meter|reader|libre|sensor|transmitter|receiver|omnipod|dexcom|medtronic|needle|pump|reservoir|infusion|cartridge/i;
const STRIP_BRAND = /one\s?touch|free\s?style|contour|accu[\s-]?chek|aviva|true\s?metrix/i;
const HAS_COUNT = /\b\d+\s?ct\b/i;

export const expiryRules: ExpiryRule[] = [
  {
    key: "dexcom-g7-receivers",
    title: "Dexcom G7 receivers",
    covers: "Every Dexcom G7 receiver -- these do not expire, so no expiration date is asked for.",
    noExpiration: true,
    options: [],
    matches: ({ name }) => /dexcom\s*g7/i.test(name) && /receiver/i.test(name),
  },
  {
    key: "libre-readers",
    title: "Freestyle Libre readers",
    covers: "Every Freestyle Libre reader -- these do not expire, so no expiration date is asked for.",
    noExpiration: true,
    options: [],
    matches: ({ name }) => /libre/i.test(name) && /reader/i.test(name),
  },
  {
    key: "libre-sensors",
    title: "Freestyle Libre sensors",
    covers: "Every Freestyle Libre sensor (Libre 2, Libre 3, Libre 3 Plus, 14 Day). Readers are not included.",
    options: [{ label: "4+ months", minMonths: 4, maxMonths: null, multiplier: 1 }],
    matches: ({ name }) => /free\s?style\s*libre/i.test(name) && !/reader/i.test(name),
  },
  {
    key: "dexcom-g7",
    title: "Dexcom G7 sensors",
    covers: "Every Dexcom G7 10-day and 15-day sensor (receivers, transmitters and G6 are not included).",
    options: [
      { label: "7+ months", minMonths: 7, maxMonths: null, multiplier: 1 },
      { label: "5-6 months", minMonths: 5, maxMonths: 6, multiplier: 0.5 },
    ],
    matches: ({ name }) => /dexcom\s*g7/i.test(name) && /sensor/i.test(name) && !/receiver|transmitter/i.test(name),
  },
  {
    key: "omnipod",
    title: "Omnipod supplies",
    covers: "Every product with Omnipod in its name.",
    options: [
      { label: "8+ months", minMonths: 8, maxMonths: null, multiplier: 1 },
      { label: "5-7 months", minMonths: 5, maxMonths: 7, multiplier: 0.5 },
    ],
    matches: ({ name }) => /omnipod/i.test(name),
  },
  {
    key: "medtronic",
    title: "Medtronic supplies",
    covers: "Every product with Medtronic in its name.",
    options: [{ label: "12+ months", minMonths: 12, maxMonths: null, multiplier: 1 }],
    matches: ({ name }) => /medtronic/i.test(name),
  },
  {
    key: "test-strips",
    title: "Test strips",
    covers:
      "OneTouch, Freestyle, Contour, Accu-Chek and True Metrix strips (anything counted in ct). Meters, lancets and Libre sensors are not included.",
    options: [{ label: "10+ months", minMonths: 10, maxMonths: null, multiplier: 1 }],
    matches: ({ name, categoryName }) => {
      if (NOT_A_STRIP.test(name)) return false;
      const brandedStrip = STRIP_BRAND.test(name) && HAS_COUNT.test(name);
      const inStripCategory = /strip/i.test(categoryName ?? "");
      return brandedStrip || inStripCategory;
    },
  },
];

export function ruleForProduct(product: { name: string; categoryName: string | null }): ExpiryRule | null {
  return expiryRules.find((r) => r.matches(product)) ?? null;
}

/** Same month range = same label and same start/end months (multiplier is looked at separately). */
export function sameRangeShape(
  a: { label: string; minMonths: number | null; maxMonths: number | null },
  b: { label: string; minMonths: number | null; maxMonths: number | null },
) {
  return (
    a.label.trim().toLowerCase() === b.label.trim().toLowerCase() &&
    (a.minMonths ?? null) === (b.minMonths ?? null) &&
    (a.maxMonths ?? null) === (b.maxMonths ?? null)
  );
}
