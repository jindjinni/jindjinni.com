// Industry knowledge that ships with the platform: general facts that are true for every brand. Brand-specific facts
// (a maker's lot or serial layout, recall notes, counterfeit signs for one product) are NOT written here on purpose;
// the platform owner records them in the Jin library, each with its source and the date it was last verified.

export type KnowledgeCategory = "lot_serial" | "ndc" | "barcode" | "recall" | "counterfeit" | "manufacturer" | "rule" | "other";

export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  lot_serial: "Lot & serial numbers",
  ndc: "NDC numbers",
  barcode: "Barcodes (UPC, GTIN, GS1, UDI)",
  recall: "Recalls",
  counterfeit: "Counterfeits & red flags",
  manufacturer: "Manufacturers",
  rule: "House rules (always followed)",
  other: "Other",
};

export type KnowledgeEntry = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  brand: string | null;
  body: string;
  source: string;
  verifiedOn: string | null;
  /** Lot or serial layouts in the plain symbols of industry-checks.ts (only library entries use this). */
  formats?: string[];
  formatKind?: "lot" | "serial";
};

export const BUILTIN_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "builtin-ndc",
    title: "What an NDC is and how it is written",
    category: "ndc",
    brand: null,
    body: "An NDC (National Drug Code) identifies a drug product and its package. It has three parts: the labeler (assigned by the FDA), the product and the package size (both chosen by the labeler). Printed NDCs have 10 digits in one of three layouts: 4-4-2, 5-3-2 or 5-4-1. Billing systems use 11 digits as 5-4-2, adding a leading zero to the short part (4-4-2 becomes 0xxxx-xxxx-xx, 5-3-2 becomes xxxxx-0xxx-xx, 5-4-1 becomes xxxxx-xxxx-0x). Without hyphens a 10-digit NDC cannot be told apart by itself, so look at the printed hyphens. An NDC names a product and package type, not one physical box, so it never proves a box is genuine. Many medical devices, such as glucose test strips and sensors, are identified by a UDI/GTIN barcode instead of an NDC, although some packaging also prints an NDC or UPC.",
    source: "FDA National Drug Code overview",
    verifiedOn: "2026-10-07",
  },
  {
    id: "builtin-gs1",
    title: "Reading a GS1 barcode (lot, serial, expiry)",
    category: "barcode",
    brand: null,
    body: "Drug and device labels often carry a GS1 barcode (DataMatrix or GS1-128). Its text is made of codes: (01) the product's GTIN-14, (10) the lot or batch, (11) the production date, (17) the expiration date as YYMMDD, and (21) the serial number. In an expiration date a day of 00 means the last day of that month. The last digit of a GTIN is a check digit that can be calculated, so a wrong one means a typing, scanning or made-up number. A device's UDI is its device identifier (the GTIN) plus these production details (lot, serial, expiry, manufacture date). The FDA's public GUDID database can be searched by the device identifier to see who the labeler is and what the product is.",
    source: "GS1 General Specifications; FDA UDI system and GUDID",
    verifiedOn: "2026-10-07",
  },
  {
    id: "builtin-format-limits",
    title: "What a format check can and cannot tell you",
    category: "lot_serial",
    brand: null,
    body: "Makers choose their own lot and serial layouts and sometimes change them without notice. A number that fits a recorded layout is only well formed: counterfeiters can copy a layout, and real products can come from lots that follow an older or newer layout. A number that does not fit a recorded layout is a reason to look closer, not proof of a fake. Always compare the lot and expiration printed on the outer box, the inner box and the product itself, and check the lot against the maker's and the FDA's recall notices.",
    source: "Platform guidance",
    verifiedOn: "2026-10-07",
  },
  {
    id: "builtin-recalls",
    title: "Checking a product against recalls",
    category: "recall",
    brand: null,
    body: "A recall can cover every unit of a product or only certain lots, serial ranges or expiration dates, so the lot and expiry matter, not just the product name. Official places to look are the maker's own recall or field-safety notice page and the FDA's recall databases (drugs, devices, enforcement reports). A search that finds nothing does not prove there is no recall, because notices can be late or worded differently. In this platform the Receiving department's recall checks compare received lot and serial numbers against the recalls the team has set up, and the Home screen's industry news shows recent recalls for the brands the company buys.",
    source: "FDA recall resources; platform behaviour",
    verifiedOn: "2026-10-07",
  },
  {
    id: "builtin-counterfeit-signs",
    title: "General signs that a package deserves a closer look",
    category: "counterfeit",
    brand: null,
    body: "None of these proves a product is fake, and a product with none of them can still be fake. Signs worth a closer look: lot or expiration that differ between the outer box, inner box and product; labels or stickers that look reprinted, covered or peeled; misspellings, blurry printing or colours that differ from a known good box; packaging for another country's market; a box that was opened, resealed or taped; missing inserts or accessories; a price far below the market; a seller who cannot say where the product came from; and a barcode whose check digit is wrong or whose lot and expiry do not match the printed text. When in doubt, hold the product, photograph everything, and ask the maker or the supplier to verify the lot.",
    source: "Platform guidance",
    verifiedOn: "2026-10-07",
  },
  {
    id: "builtin-no-verdict",
    title: "Jin never declares a product genuine, safe or recall-free",
    category: "rule",
    brand: null,
    body: "Jin helps people decide; it does not decide. It may say a number is well formed, fits a recorded layout, does not fit one, or that something looks unusual and why. It must never say a product is genuine, authentic, safe, legal to sell, free of recalls or unexpired in reality. It always names where its information came from and tells the person to confirm with the maker or the official source when the stakes are real.",
    source: "Platform rule",
    verifiedOn: "2026-10-07",
  },
];
