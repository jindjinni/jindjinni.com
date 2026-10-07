// What to look for, for each brand the company buys. The brand is the company's own Purchasing category name
// ("Dexcom", "Freestyle", "OneTouch"...). Each one maps to the manufacturer (the FDA lists recalls under the maker's
// name, not the brand's) and to the words news headlines use. A brand not listed here is searched under its own name.
// To cover a new brand, add a line to PROFILES. Pure; reads nothing.

export type BrandProfile = {
  /** The company's brand name, as shown on the Home screen. */
  brand: string;
  /** The company that owns or makes the brand ("Abbott" for FreeStyle Libre), shown next to the brand. Empty when unknown. */
  owner: string;
  /** True when the owner came from the built-in list below or was looked up; false when the brand is searched only under its own name. */
  known: boolean;
  /** The maker's name(s) as the FDA recall list prints them. */
  firms: string[];
  /** Words or phrases that mean a headline or recall is about this brand (lower case). */
  terms: string[];
  /** True when the maker also sells lots of unrelated things (Abbott, Medtronic, BD...): then only text that mentions one of `terms` counts, not every recall by the maker. */
  broadMaker: boolean;
};

type Entry = { match: RegExp; owner: string; firms: string[]; terms: string[]; broadMaker?: boolean };

const PROFILES: Entry[] = [
  { owner: "Dexcom", match: /dexcom/i, firms: ["Dexcom"], terms: ["dexcom"] },
  { owner: "Insulet", match: /omnipod|insulet/i, firms: ["Insulet"], terms: ["omnipod", "insulet"] },
  { owner: "Abbott", match: /free\s?style|libre/i, firms: ["Abbott Diabetes Care"], terms: ["freestyle", "free style", "libre", "abbott diabetes", "abbott's diabetes"], broadMaker: true },
  { owner: "LifeScan", match: /one\s?touch|lifescan/i, firms: ["LifeScan"], terms: ["onetouch", "one touch", "lifescan"] },
  { owner: "Roche", match: /accu[\s-]?chek|roche diabetes/i, firms: ["Roche Diabetes Care"], terms: ["accu-chek", "accu chek", "accuchek", "roche diabetes"] },
  { owner: "Ascensia Diabetes Care", match: /contour|ascensia|bayer diabetes/i, firms: ["Ascensia Diabetes Care"], terms: ["contour next", "contour plus", "ascensia", "contour"], broadMaker: false },
  { owner: "Medtronic", match: /medtronic|minimed|guardian/i, firms: ["Medtronic MiniMed"], terms: ["minimed", "guardian sensor", "guardian 4", "simplera", "medtronic diabetes", "medtronic insulin", "medtronic diabetes", "medtronic"], broadMaker: true },
  { owner: "Tandem Diabetes Care", match: /tandem|t:slim|tslim/i, firms: ["Tandem Diabetes Care"], terms: ["tandem diabetes", "t:slim", "tslim", "mobi"] },
  { owner: "Becton Dickinson (BD)", match: /\bbd\b|pen needle|becton/i, firms: ["Becton Dickinson"], terms: ["bd pen needle", "bd ultra-fine", "bd micro-fine", "becton dickinson diabetes", "bd diabetes"], broadMaker: true },
  { owner: "Trividia Health", match: /true\s?metrix|trividia/i, firms: ["Trividia Health"], terms: ["true metrix", "truemetrix", "trividia"] },
  { owner: "Senseonics", match: /eversense|senseonics/i, firms: ["Senseonics"], terms: ["eversense", "senseonics"] },
  { owner: "Diagnostic Devices", match: /prodigy/i, firms: ["Diagnostic Devices"], terms: ["prodigy autocode", "prodigy voice", "prodigy glucose"] },
  { owner: "Embecta", match: /embecta/i, firms: ["Embecta"], terms: ["embecta"] },
];

/** What a brand's owner was worked out to be by Claude, for a brand that is not in the list above (saved per company). */
export type LearnedMaker = { owner: string; firms: string[]; terms: string[]; broadMaker: boolean };

export function profileFor(brand: string, learned?: LearnedMaker | null): BrandProfile {
  const name = brand.trim();
  const hit = PROFILES.find((p) => p.match.test(name));
  if (hit) return { brand: name, owner: hit.owner, known: true, firms: hit.firms, terms: [...new Set([...hit.terms, name.toLowerCase()])], broadMaker: !!hit.broadMaker };
  if (learned && learned.owner) return { brand: name, owner: learned.owner, known: true, firms: learned.firms.length ? learned.firms : [learned.owner], terms: [...new Set([...learned.terms, name.toLowerCase()])], broadMaker: learned.broadMaker };
  return { brand: name, owner: "", known: false, firms: [name], terms: [name.toLowerCase()], broadMaker: false };
}

/** True when the brand is on the built-in list (no lookup needed). */
export const isListedBrand = (brand: string) => PROFILES.some((p) => p.match.test(brand.trim()));

/** True when the text talks about this brand. */
export function mentionsBrand(text: string, profile: BrandProfile): boolean {
  const t = text.toLowerCase();
  return profile.terms.some((w) => w && t.includes(w));
}

/** The search words for a news search: the brand's own words in quotes, joined by OR. */
export function newsQuery(profile: BrandProfile): string {
  const words = [...new Set([profile.brand, ...profile.terms.filter((w) => w.length > 3)])].slice(0, 4);
  return `(${words.map((w) => `"${w}"`).join(" OR ")})`;
}
