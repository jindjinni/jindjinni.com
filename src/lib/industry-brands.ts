// What to look for, for each brand the company buys. The brand is the company's own Purchasing category name
// ("Dexcom", "Freestyle", "OneTouch"). The basis of the Home screen is news FROM THE MANUFACTURER of the brand, and news
// about the manufacturer's own products for that brand (recalls, safety notices, new and upcoming products, supply, business
// changes). So each brand maps to the maker (the FDA lists recalls under the maker's name, not the brand's), to the words that
// point at the brand's own products, and to the maker's own websites (a story from one of them is marked "From the maker").
// A brand name that is also an everyday word (Contour, Freestyle, OneTouch) is "ambiguous": the bare name never counts as a match
// on its own (a "Contour Airlines" headline is not about Contour glucose meters); only the product and maker words do.
// To cover a new brand, add a line to PROFILES. Pure; reads nothing.

export type BrandProfile = {
  /** The company's brand name, as shown on the Home screen. */
  brand: string;
  /** The company that owns or makes the brand ("Abbott" for FreeStyle Libre), shown next to the brand. Empty when unknown. */
  owner: string;
  /** True when the owner came from the built-in list or was looked up; false when the brand is searched only under its own name. */
  known: boolean;
  /** The maker's name(s) as the FDA recall list prints them. */
  firms: string[];
  /** Words or phrases that mean a headline or recall is about this brand's products or its maker (lower case). */
  terms: string[];
  /** True when the maker also sells lots of unrelated things (Abbott, Medtronic, BD...): then only text that mentions one of `terms` counts, not every recall by the maker. */
  broadMaker: boolean;
  /** True when the bare brand name is also an everyday word or another business's name, so it is not used alone. */
  ambiguous: boolean;
  /** The maker's own websites. */
  domains: string[];
};

type Entry = { match: RegExp; owner: string; firms: string[]; terms: string[]; domains: string[]; broadMaker?: boolean; ambiguous?: boolean };

const PROFILES: Entry[] = [
  { owner: "Dexcom", match: /dexcom/i, firms: ["Dexcom"], terms: ["dexcom"], domains: ["dexcom.com"] },
  { owner: "Insulet", match: /omnipod|insulet/i, firms: ["Insulet"], terms: ["omnipod", "insulet"], domains: ["omnipod.com", "insulet.com"] },
  {
    owner: "Abbott",
    match: /free\s?style|libre/i,
    firms: ["Abbott Diabetes Care"],
    terms: ["freestyle libre", "freestyle lite", "freestyle precision", "freestyle freedom", "freestyle insulinx", "libre 3", "libre 2", "libre sensor", "abbott diabetes", "abbott's diabetes", "abbott libre"],
    domains: ["freestyle.abbott", "freestylelibre.us", "abbott.com"],
    broadMaker: true,
    ambiguous: true,
  },
  {
    owner: "LifeScan",
    match: /one\s?touch|lifescan/i,
    firms: ["LifeScan"],
    terms: ["onetouch verio", "onetouch ultra", "onetouch select", "onetouch reveal", "one touch ultra", "one touch verio", "one touch select", "lifescan"],
    domains: ["onetouch.com", "lifescan.com"],
    ambiguous: true,
  },
  { owner: "Roche", match: /accu[\s-]?chek|roche diabetes/i, firms: ["Roche Diabetes Care"], terms: ["accu-chek", "accu chek", "accuchek", "roche diabetes"], domains: ["accu-chek.com", "diabetes.roche.com", "roche.com"] },
  {
    owner: "Ascensia Diabetes Care",
    match: /contour|ascensia|bayer diabetes/i,
    firms: ["Ascensia Diabetes Care"],
    terms: ["contour next", "contour plus", "contour diabetes", "bayer contour", "ascensia"],
    domains: ["ascensia.com", "diabetes.ascensia.com", "contournext.com"],
    ambiguous: true,
  },
  {
    owner: "Medtronic",
    match: /medtronic|minimed|guardian/i,
    firms: ["Medtronic MiniMed"],
    terms: ["minimed", "medtronic diabetes", "medtronic insulin pump", "guardian sensor", "guardian 4", "guardian connect", "simplera", "medtronic 780g", "medtronic 770g"],
    domains: ["medtronicdiabetes.com", "minimed.com", "medtronic.com"],
    broadMaker: true,
  },
  { owner: "Tandem Diabetes Care", match: /tandem|t:slim|tslim/i, firms: ["Tandem Diabetes Care"], terms: ["tandem diabetes", "t:slim", "tslim", "tandem mobi"], domains: ["tandemdiabetes.com"] },
  {
    owner: "Becton Dickinson (BD)",
    match: /\bbd\b|pen needle|becton/i,
    firms: ["Becton Dickinson"],
    terms: ["bd pen needle", "bd ultra-fine", "bd micro-fine", "becton dickinson diabetes", "bd diabetes"],
    domains: ["bd.com"],
    broadMaker: true,
  },
  { owner: "Trividia Health", match: /true\s?metrix|trividia/i, firms: ["Trividia Health"], terms: ["true metrix", "truemetrix", "trividia"], domains: ["trividia.com", "truemetrix.com"] },
  { owner: "Senseonics", match: /eversense|senseonics/i, firms: ["Senseonics"], terms: ["eversense", "senseonics"], domains: ["eversensediabetes.com", "senseonics.com"] },
  { owner: "Diagnostic Devices", match: /prodigy/i, firms: ["Diagnostic Devices"], terms: ["prodigy autocode", "prodigy voice", "prodigy glucose", "prodigy diabetes"], domains: ["prodigymeter.com"], ambiguous: true },
  { owner: "Embecta", match: /embecta/i, firms: ["Embecta"], terms: ["embecta"], domains: ["embecta.com"] },
];

/** What a brand's owner was worked out to be by Claude, for a brand that is not in the list above (saved per company). */
export type LearnedMaker = { owner: string; firms: string[]; terms: string[]; broadMaker: boolean; ambiguous: boolean };

/** A bare brand name is added to the search words only when it can't be mistaken for something else. */
const withBare = (terms: string[], name: string, skip: boolean) => [...new Set(skip ? terms : [...terms, name.toLowerCase()])];

export function profileFor(brand: string, learned?: LearnedMaker | null): BrandProfile {
  const name = brand.trim();
  const hit = PROFILES.find((p) => p.match.test(name));
  if (hit) {
    const ambiguous = !!hit.ambiguous;
    return { brand: name, owner: hit.owner, known: true, firms: hit.firms, terms: withBare(hit.terms, name, ambiguous || !!hit.broadMaker), broadMaker: !!hit.broadMaker, ambiguous, domains: hit.domains };
  }
  if (learned && learned.owner) {
    return { brand: name, owner: learned.owner, known: true, firms: learned.firms.length ? learned.firms : [learned.owner], terms: withBare(learned.terms, name, learned.ambiguous || learned.broadMaker), broadMaker: learned.broadMaker, ambiguous: learned.ambiguous, domains: [] };
  }
  return { brand: name, owner: "", known: false, firms: [name], terms: [name.toLowerCase()], broadMaker: false, ambiguous: false, domains: [] };
}

/** True when the brand is on the built-in list (no lookup needed). */
export const isListedBrand = (brand: string) => PROFILES.some((p) => p.match.test(brand.trim()));

/** True when the text talks about this brand's products or its maker. */
export function mentionsBrand(text: string, profile: BrandProfile): boolean {
  const t = text.toLowerCase();
  return profile.terms.some((w) => w && t.includes(w));
}

/** Words that show a headline is about medical supplies (used for brands whose names are everyday words). */
const MEDICAL = /\b(diabet\w*|glucose|insulin|cgm|blood sugar|test strips?|glucometer|meters?|sensors?|pumps?|lancets?|fda|medical|health\w*|patients?|device|recall\w*|pharma\w*|clinical)\b/i;

/** A search word that can't be mistaken for anything else: a phrase ("contour next"), a model ("libre 3") or a long company name ("ascensia"). */
const isSpecific = (w: string) => /[\s\-\d:]/.test(w) || w.length >= 8;

/**
 * A headline counts for this brand when it mentions the brand's products or maker. For an everyday-word brand it must also be
 * about medical supplies, unless it uses a specific product or maker phrase (then it already can't be about something else).
 */
export function fitsBrand(text: string, profile: BrandProfile): boolean {
  if (!mentionsBrand(text, profile)) return false;
  if (!profile.ambiguous || MEDICAL.test(text)) return true;
  const t = text.toLowerCase();
  return profile.terms.some((w) => isSpecific(w) && t.includes(w));
}

const WIRES = ["prnewswire.com", "businesswire.com", "globenewswire.com", "accesswire.com"];
const hostOf = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** True when the story comes from the maker's own website. */
export const isFromMaker = (host: string | null | undefined, profile: BrandProfile) => !!host && profile.domains.some((d) => hostOf(host) === d || hostOf(host).endsWith(`.${d}`));
/** True when the story is a company announcement on a press-release wire. */
export const isPressRelease = (host: string | null | undefined) => !!host && WIRES.some((d) => hostOf(host) === d || hostOf(host).endsWith(`.${d}`));
export const PRESS_SITES = WIRES;

/** The words for a news search: the product and maker words in quotes, joined by OR (the bare brand name only when it can't be mistaken). */
export function searchWords(profile: BrandProfile): string[] {
  const words = [...new Set([...(profile.ambiguous || profile.broadMaker ? [] : [profile.brand.toLowerCase()]), ...profile.terms.filter((w) => w.length > 3)])];
  return words.slice(0, 5);
}

export function newsQuery(profile: BrandProfile): string {
  const group = `(${searchWords(profile).map((w) => `"${w}"`).join(" OR ")})`;
  return profile.ambiguous ? `${group} (diabetes OR glucose OR insulin OR FDA OR recall OR "test strips" OR sensor OR pump)` : group;
}

/** The second search: announcements the maker itself put out (its own website and the press-release wires). */
export function makerQuery(profile: BrandProfile): string {
  const sites = [...PRESS_SITES, ...profile.domains.slice(0, 3)].map((d) => `site:${d}`).join(" OR ");
  return `${newsQuery(profile)} (${sites})`;
}
