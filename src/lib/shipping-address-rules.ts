// Shipping addresses, the pure part: reading a US address typed as one block of text, checking an address is complete enough for a
// carrier label, and the box size and weight. No database and no network, so it is fully testable.

export type Address = {
  name: string;
  company?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

export const CONTACT_KINDS = ["BUYER", "SELLER", "SUPPLIER", "OTHER"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const isContactKind = (v: unknown): v is ContactKind => typeof v === "string" && (CONTACT_KINDS as readonly string[]).includes(v);

/** The word a profile kind shows as. `buyers` is the company's own word for its buyers (Pharmacies, Wholesale buyers, Buyers...). */
export function kindLabel(kind: string, buyers = "Buyers"): string {
  if (kind === "BUYER") return buyers;
  if (kind === "SELLER") return "Sellers";
  if (kind === "SUPPLIER") return "Suppliers";
  return "Other";
}
export function kindOne(kind: string, buyers = "Buyers"): string {
  const w = kindLabel(kind, buyers);
  return w.endsWith("ies") ? w.slice(0, -3) + "y" : w.endsWith("s") ? w.slice(0, -1) : w;
}

const STATES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID",
  ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX",
  UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC", "PUERTO RICO": "PR",
};
const CODES = new Set(Object.values(STATES));

/** "texas" or "TX" -> "TX"; null when it isn't a state. */
export function stateCode(raw: string): string | null {
  const t = raw.trim().replace(/\./g, "").toUpperCase();
  if (CODES.has(t)) return t;
  return STATES[t] ?? null;
}

export type ParsedAddress = { street1: string; street2: string | null; city: string; state: string; zip: string };

/**
 * Reads a US address typed as text: "123 Main St, Suite 4, Austin, TX 78701" or the same on several lines. Returns null when it
 * can't find a city, state and ZIP (the person then types the parts in).
 */
export function parseUsAddress(raw: string | null | undefined): ParsedAddress | null {
  const text = String(raw ?? "").replace(/\r/g, "").replace(/\s*(?:USA|United States(?: of America)?|US)\.?\s*$/i, "").trim();
  if (!text) return null;
  // The tail is "<city> <state> <zip>"; the state is a 2-letter code or a state name.
  const z = /^([\s\S]*?)[,\s]+(\d{5})(?:-(\d{4}))?\s*$/.exec(text.replace(/\n+/g, ", "));
  if (!z) return null;
  let rest = z[1].replace(/[,\s]+$/, "");
  let st: string | null = null;
  const two = /^([\s\S]*?)[,\s]+([A-Za-z]{2})\.?$/.exec(rest);
  if (two && stateCode(two[2])) {
    st = stateCode(two[2]);
    rest = two[1];
  } else {
    for (const name of Object.keys(STATES).sort((x, y) => y.length - x.length)) {
      const m = new RegExp(`^(.*?)[,\\s]+${name.replace(/ /g, "\\s+")}$`, "i").exec(rest);
      if (m) {
        st = STATES[name];
        rest = m[1];
        break;
      }
    }
  }
  if (!st) return null;
  const tail = [z[0], rest, st, z[2], z[3]];
  const zip = tail[4] ? `${tail[3]}-${tail[4]}` : tail[3];
  const parts = String(tail[1]).split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    // "123 Main St Austin" with no comma: the last word is the city (a one-word city is the common case).
    const words = (parts[0] ?? "").split(/\s+/);
    if (words.length < 3) return null;
    const city = words.pop()!;
    return { street1: words.join(" "), street2: null, city, state: st as string, zip };
  }
  const city = parts[parts.length - 1];
  const street = parts.slice(0, -1);
  return { street1: street[0], street2: street.length > 1 ? street.slice(1).join(", ") : null, city, state: st as string, zip };
}

/** Everything a carrier needs, in the order to fix it. Empty list = ready for a label. */
export type AddressLike = Partial<Record<keyof Address, string | null | undefined>>;
export function addressProblems(a: AddressLike | null | undefined): string[] {
  const out: string[] = [];
  if (!a) return ["Add the address to ship to."];
  if (!(a.name ?? "").trim() && !(a.company ?? "").trim()) out.push("a name");
  if (!(a.street1 ?? "").trim()) out.push("the street");
  if (!(a.city ?? "").trim()) out.push("the city");
  if (!stateCode(a.state ?? "")) out.push("the state (2 letters, like TX)");
  if (!/^\d{5}(-\d{4})?$/.test((a.zip ?? "").trim())) out.push("the ZIP code");
  return out.length ? [`Still needed: ${out.join(", ")}.`] : [];
}

export const addressReady = (a: AddressLike | null | undefined) => addressProblems(a).length === 0;

/** The address as the lines a label shows. */
export function addressLines(a: AddressLike): string[] {
  const l: string[] = [];
  if (a.company?.trim()) l.push(a.company.trim());
  if (a.name?.trim() && a.name.trim() !== a.company?.trim()) l.push(a.name.trim());
  if (a.street1?.trim()) l.push(a.street1.trim());
  if (a.street2?.trim()) l.push(a.street2.trim());
  const cs = [a.city?.trim(), [stateCode(a.state ?? "") ?? a.state?.trim(), a.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (cs) l.push(cs);
  return l;
}

/** A cleaned copy of an address: trimmed, state as its 2-letter code, nothing longer than a carrier accepts. */
export type CleanAddress = { name: string; company: string | null; street1: string; street2: string | null; city: string; state: string; zip: string; country: string; phone: string | null; email: string | null };
export function cleanAddress(a: Partial<Record<keyof Address, string | null | undefined>>): CleanAddress {
  const t = (v: unknown, n: number) => {
    const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
    return s || null;
  };
  return {
    name: t(a.name, 80) ?? "",
    company: t(a.company, 80),
    street1: t(a.street1, 100) ?? "",
    street2: t(a.street2, 100),
    city: t(a.city, 60) ?? "",
    state: stateCode(a.state ?? "") ?? (t(a.state, 20) ?? ""),
    zip: t(a.zip, 12) ?? "",
    country: (t(a.country, 2) ?? "US").toUpperCase(),
    phone: t(a.phone, 30),
    email: t(a.email, 120),
  };
}

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

export type Parcel = { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };
/** What the form starts with: a small carton. */
export const DEFAULT_PARCEL: Parcel = { lengthIn: 12, widthIn: 9, heightIn: 6, weightLb: 2 };

export type ParcelCheck = { ok: true; parcel: Parcel } | { ok: false; error: string };

export function checkParcel(p: { lengthIn: unknown; widthIn: unknown; heightIn: unknown; weightLb: unknown }): ParcelCheck {
  const n = (v: unknown) => Number(String(v ?? "").trim());
  const parcel = { lengthIn: n(p.lengthIn), widthIn: n(p.widthIn), heightIn: n(p.heightIn), weightLb: n(p.weightLb) };
  for (const [k, v] of Object.entries(parcel)) {
    if (!Number.isFinite(v) || v <= 0) return { ok: false, error: `Type the ${k === "weightLb" ? "weight in pounds" : k.replace("In", "").replace(/^./, (c) => c.toLowerCase()) + " in inches"} (more than zero).` };
  }
  if (Math.max(parcel.lengthIn, parcel.widthIn, parcel.heightIn) > 60) return { ok: false, error: "No side can be longer than 60 inches." };
  if (parcel.weightLb > 70) return { ok: false, error: "A box can weigh up to 70 pounds." };
  return { ok: true, parcel };
}
