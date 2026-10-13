import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, organizations } from "@/db/schema";
import type { AddressValues } from "@/components/address-settings-form";

/**
 * What an address form starts with. A company that has not filled an address in yet starts from its business profile
 * (shown, never saved until the owner presses Save). `which` is the address being edited.
 */
export async function addressFormValues(organizationId: string, which: "shipFrom" | "receive"): Promise<{ values: AddressValues; prefilled: boolean; sameAsShipping: boolean; hasOwnReceiving: boolean }> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.organizationId, organizationId)).limit(1);
  const ship: AddressValues = {
    name: row?.shipFromName ?? null, company: row?.shipFromCompany ?? null, street1: row?.shipFromStreet1 ?? null, street2: row?.shipFromStreet2 ?? null, city: row?.shipFromCity ?? null,
    state: row?.shipFromState ?? null, zip: row?.shipFromZip ?? null, country: row?.shipFromCountry ?? "US", phone: row?.shipFromPhone ?? null, email: row?.shipFromEmail ?? null,
  };
  const rec: AddressValues = {
    name: row?.receiveName ?? null, company: row?.receiveCompany ?? null, street1: row?.receiveStreet1 ?? null, street2: row?.receiveStreet2 ?? null, city: row?.receiveCity ?? null,
    state: row?.receiveState ?? null, zip: row?.receiveZip ?? null, country: row?.receiveCountry ?? "US", phone: row?.receivePhone ?? null, email: row?.receiveEmail ?? null,
  };
  const hasOwnReceiving = !!rec.street1;
  const mine = which === "shipFrom" ? ship : rec;
  if (mine.street1) return { values: mine, prefilled: false, sameAsShipping: false, hasOwnReceiving };
  // Nothing saved here yet: start from the other address if it exists, else from the business profile.
  if (which === "receive" && ship.street1) return { values: ship, prefilled: true, sameAsShipping: true, hasOwnReceiving };
  if (profile?.businessAddressStreet1) {
    const useShipping = profile.shippingSameAsBusiness === false;
    const contact = [profile.primaryContactFirstName, profile.primaryContactLastName].filter(Boolean).join(" ");
    return {
      values: {
        name: mine.name ?? (contact || row?.name || null), company: mine.company ?? (profile.dbaName || row?.name || null),
        street1: useShipping ? profile.shippingAddressStreet1 : profile.businessAddressStreet1, street2: useShipping ? profile.shippingAddressStreet2 : profile.businessAddressStreet2,
        city: useShipping ? profile.shippingAddressCity : profile.businessAddressCity, state: useShipping ? profile.shippingAddressState : profile.businessAddressState,
        zip: useShipping ? profile.shippingAddressZip : profile.businessAddressZip, country: "US", phone: mine.phone ?? profile.businessPhone, email: mine.email ?? profile.businessEmail,
      },
      prefilled: true, sameAsShipping: false, hasOwnReceiving,
    };
  }
  return { values: mine, prefilled: false, sameAsShipping: false, hasOwnReceiving };
}
