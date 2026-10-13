// "Is this person already in the customer list?" -- one rule used when
// importing customers (and when an order import adds customers), so the same
// person never gets two customer records. Pure functions, no DB.
//
// A person counts as already there when:
//   1. the email is the same, or
//   2. the full name AND the phone number are the same, or
//   3. the full name AND the mailing address (street + ZIP) are the same, or
//   4. the phone number AND the mailing address are the same, or
//   5. the full name is the same and there is no email or phone on one side
//      to tell the two apart.
// Same name but a different email AND a different phone (and address) = a different person.
// A phone number or an address on its own is NOT enough: family members share them.

export type DedupeCandidate = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street1?: string | null;
  city?: string | null;
  zip?: string | null;
};

export type DedupeMatch = { id: string; reason: string };

export const normalizeFullName = (first: string, last?: string | null) =>
  `${first} ${last ?? ""}`.toLowerCase().replace(/[.,'’"]/g, "").replace(/\s+/g, " ").trim();

export const normalizeEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();

export function normalizePhone(p?: string | null): string {
  let d = (p ?? "").replace(/\.0+$/, "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 7 ? d : "";
}

const STREET_WORDS: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", lane: "ln", court: "ct", boulevard: "blvd", apartment: "apt",
  place: "pl", circle: "cir", terrace: "ter", highway: "hwy", parkway: "pkwy", suite: "ste", north: "n", south: "s", east: "e", west: "w",
};

/** One comparable key for a mailing address: street (abbreviations unified, punctuation dropped) + 5-digit ZIP (or the city when there is no ZIP). "" when there is no street. */
export function normalizeAddressKey(street1?: string | null, zip?: string | null, city?: string | null): string {
  const street = (street1 ?? "")
    .toLowerCase()
    .replace(/[.,#'’"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w)
    .join(" ");
  if (!street) return "";
  const z = (zip ?? "").replace(/\D/g, "").slice(0, 5);
  const place = z || (city ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return place ? `${street}|${place}` : "";
}

type Entry = { id: string; displayName: string; email: string; phone: string; address: string };

export class CustomerDedupeIndex {
  private byEmail = new Map<string, Entry>();
  private byName = new Map<string, Entry[]>();
  private all: Entry[] = [];

  add(id: string, c: DedupeCandidate) {
    const displayName = `${c.firstName} ${c.lastName ?? ""}`.trim();
    const entry: Entry = {
      id,
      displayName,
      email: normalizeEmail(c.email),
      phone: normalizePhone(c.phone),
      address: normalizeAddressKey(c.street1, c.zip, c.city),
    };
    this.all.push(entry);
    if (entry.email && !this.byEmail.has(entry.email)) this.byEmail.set(entry.email, entry);
    const key = normalizeFullName(c.firstName, c.lastName);
    const list = this.byName.get(key) ?? [];
    list.push(entry);
    this.byName.set(key, list);
  }

  find(c: DedupeCandidate): DedupeMatch | null {
    const email = normalizeEmail(c.email);
    const phone = normalizePhone(c.phone);
    const address = normalizeAddressKey(c.street1, c.zip, c.city);
    if (email) {
      const hit = this.byEmail.get(email);
      if (hit) return { id: hit.id, reason: `Same email as ${hit.displayName}` };
    }
    const same = this.byName.get(normalizeFullName(c.firstName, c.lastName)) ?? [];
    for (const e of same) {
      if (phone && e.phone && phone === e.phone) return { id: e.id, reason: `Same name and phone as ${e.displayName}` };
    }
    if (address) {
      for (const e of same) {
        if (e.address === address) return { id: e.id, reason: `Same name and address as ${e.displayName}` };
      }
      if (phone) {
        for (const e of this.all) {
          if (e.phone === phone && e.address === address) return { id: e.id, reason: `Same phone and address as ${e.displayName}` };
        }
      }
    }
    for (const e of same) {
      const theyHaveNoContact = !e.email && !e.phone;
      const weHaveNoContact = !email && !phone;
      if (theyHaveNoContact || weHaveNoContact) {
        return { id: e.id, reason: `Same name as ${e.displayName} and no email or phone to tell them apart` };
      }
    }
    return null;
  }
}
