import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { addressFormValues } from "@/lib/address-prefill";

/**
 * The wholesale default for shipping: a company that has no shipping address yet gets it from its Business profile
 * (contact, company, address, phone, email), so labels work from day one. The receiving address needs nothing: until a
 * company saves a separate one, customer labels go to this same address (see org-addresses.ts).
 *
 * Only fills an EMPTY address and only when the profile has everything a label needs (USPS refuses a label with no
 * phone or email). It never overwrites an address a person saved. Safe to call any number of times.
 */
export async function fillShippingAddressFromProfile(organizationId: string): Promise<{ filled: boolean }> {
  try {
    const { values: v, prefilled } = await addressFormValues(organizationId, "shipFrom");
    if (!prefilled) return { filled: false };
    if (!v.name || !v.street1 || !v.city || !v.state || !v.zip || !v.phone || !v.email) return { filled: false };
    const res = await db
      .update(organizations)
      .set({
        shipFromName: v.name, shipFromCompany: v.company, shipFromStreet1: v.street1, shipFromStreet2: v.street2, shipFromCity: v.city,
        shipFromState: v.state.toUpperCase().slice(0, 2), shipFromZip: v.zip, shipFromCountry: "US", shipFromPhone: v.phone, shipFromEmail: v.email,
      })
      .where(and(eq(organizations.id, organizationId), or(isNull(organizations.shipFromStreet1), eq(organizations.shipFromStreet1, ""))));
    return { filled: res.rowsAffected > 0 };
  } catch (e) {
    console.error("[address-defaults] could not fill the shipping address from the business profile", e);
    return { filled: false };
  }
}
