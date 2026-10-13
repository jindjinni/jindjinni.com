// Searching and ordering the Purchasing customer list. Pure functions, no DB -- used by the
// "Existing customer" picker on a new quotation, the Customers page, and the server's ordering.
//
//  * Type a first name, a last name, part of either, or the full name (in either order) and every
//    customer who matches ALL the words you typed is shown. "ann" finds Ann, Joanna and Annette;
//    "smith" finds every Smith; "ann smith" (or "smith ann") finds Ann Smith only.
//  * Lists are always shown in alphabetical order by the name as it is displayed (first name, then
//    last name), ignoring capital letters.

export type SearchableCustomer = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[.,'’"]/g, "").replace(/\s+/g, " ").trim();

export function customerDisplayName(c: SearchableCustomer): string {
  return [c.firstName, c.lastName].filter((p) => p && p.trim()).join(" ");
}

/** The text a search is run against. `includeContact` also lets email and phone digits match (Customers page). */
export function customerSearchText(c: SearchableCustomer, includeContact = false): string {
  const parts = [squash(customerDisplayName(c))];
  if (includeContact) {
    if (c.email) parts.push(c.email.toLowerCase());
    if (c.phone) parts.push(c.phone.replace(/\D/g, ""));
  }
  return parts.join(" ");
}

/** True when every word of the query appears somewhere in the customer's search text. An empty query matches everyone. */
export function searchTextMatches(text: string, query: string): boolean {
  const words = squash(query).split(" ").filter(Boolean);
  return words.every((w) => {
    // A phone-looking word ("(334) 555-0100", "555-01") is compared as digits only.
    const phoneLike = /^[\d()+-]+$/.test(w) && w.replace(/\D/g, "").length >= 3;
    return text.includes(phoneLike ? w.replace(/\D/g, "") : w);
  });
}

export function matchesCustomerSearch(c: SearchableCustomer, query: string, includeContact = false): boolean {
  return searchTextMatches(customerSearchText(c, includeContact), query);
}

export function compareCustomersAlphabetically(a: SearchableCustomer, b: SearchableCustomer): number {
  const an = customerDisplayName(a);
  const bn = customerDisplayName(b);
  return an.localeCompare(bn, "en", { sensitivity: "base", numeric: true });
}

export function sortCustomersAlphabetically<T extends SearchableCustomer>(list: readonly T[]): T[] {
  return [...list].sort(compareCustomersAlphabetically);
}
