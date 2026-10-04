// "Is this person already in the customer list?" -- one rule used when
// importing customers (and when an order import adds customers), so the same
// person never gets two customer records. Pure functions, no DB.
//
// A person counts as already there when:
//   1. the email is the same, or
//   2. the full name AND the phone number are the same, or
//   3. the full name is the same and there is no email or phone on one side
//      to tell the two apart.
// Same name but a different email AND a different phone = a different person.

export type DedupeCandidate = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
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

type Entry = { id: string; displayName: string; email: string; phone: string };

export class CustomerDedupeIndex {
  private byEmail = new Map<string, Entry>();
  private byName = new Map<string, Entry[]>();

  add(id: string, c: DedupeCandidate) {
    const displayName = `${c.firstName} ${c.lastName ?? ""}`.trim();
    const entry: Entry = { id, displayName, email: normalizeEmail(c.email), phone: normalizePhone(c.phone) };
    if (entry.email && !this.byEmail.has(entry.email)) this.byEmail.set(entry.email, entry);
    const key = normalizeFullName(c.firstName, c.lastName);
    const list = this.byName.get(key) ?? [];
    list.push(entry);
    this.byName.set(key, list);
  }

  find(c: DedupeCandidate): DedupeMatch | null {
    const email = normalizeEmail(c.email);
    const phone = normalizePhone(c.phone);
    if (email) {
      const hit = this.byEmail.get(email);
      if (hit) return { id: hit.id, reason: `Same email as ${hit.displayName}` };
    }
    const same = this.byName.get(normalizeFullName(c.firstName, c.lastName)) ?? [];
    for (const e of same) {
      if (phone && e.phone && phone === e.phone) return { id: e.id, reason: `Same name and phone as ${e.displayName}` };
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
