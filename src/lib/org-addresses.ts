// The company's two addresses. Not a "use server" file: plain helpers shared by Purchasing and Shipping.
//
//  * Shipping address (organizations.ship_from_*): where WE are the sender. Every label made in the Shipping department
//    (returns to customers, shipments to suppliers and distributors) goes FROM here.
//  * Receiving address (organizations.receive_*): where customers ship their supplies TO. Every Purchasing label goes
//    FROM the customer TO here. A company that never filled it in keeps working: Purchasing then uses the shipping address.

export type AddressFields = {
  name: string;
  company: string | null;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
  email: string | null;
};

type OrgAddressRow = {
  shipFromName: string | null; shipFromCompany: string | null; shipFromStreet1: string | null; shipFromStreet2: string | null; shipFromCity: string | null; shipFromState: string | null;
  shipFromZip: string | null; shipFromCountry: string | null; shipFromPhone: string | null; shipFromEmail: string | null;
  receiveName?: string | null; receiveCompany?: string | null; receiveStreet1?: string | null; receiveStreet2?: string | null; receiveCity?: string | null; receiveState?: string | null;
  receiveZip?: string | null; receiveCountry?: string | null; receivePhone?: string | null; receiveEmail?: string | null;
};

const has = (v: string | null | undefined) => !!(v ?? "").trim();

/** Everything a label purchase needs from an address (USPS refuses a label with no phone or email). */
function complete(name: string | null, street1: string | null, city: string | null, state: string | null, zip: string | null, phone: string | null, email: string | null) {
  return has(name) && has(street1) && has(city) && has(state) && has(zip) && has(phone) && has(email);
}

/** The address we ship FROM in the Shipping department, or null when it isn't complete. */
export function shippingAddressOf(o: OrgAddressRow | null | undefined): AddressFields | null {
  if (!o || !complete(o.shipFromName, o.shipFromStreet1, o.shipFromCity, o.shipFromState, o.shipFromZip, o.shipFromPhone, o.shipFromEmail)) return null;
  return {
    name: o.shipFromName!, company: o.shipFromCompany, street1: o.shipFromStreet1!, street2: o.shipFromStreet2, city: o.shipFromCity!, state: o.shipFromState!, zip: o.shipFromZip!,
    country: o.shipFromCountry || "US", phone: o.shipFromPhone, email: o.shipFromEmail,
  };
}

/** The address customers ship TO (Purchasing), or null when it isn't complete. */
export function ownReceivingAddressOf(o: OrgAddressRow | null | undefined): AddressFields | null {
  if (!o || !complete(o.receiveName ?? null, o.receiveStreet1 ?? null, o.receiveCity ?? null, o.receiveState ?? null, o.receiveZip ?? null, o.receivePhone ?? null, o.receiveEmail ?? null)) return null;
  return {
    name: o.receiveName!, company: o.receiveCompany ?? null, street1: o.receiveStreet1!, street2: o.receiveStreet2 ?? null, city: o.receiveCity!, state: o.receiveState!, zip: o.receiveZip!,
    country: o.receiveCountry || "US", phone: o.receivePhone ?? null, email: o.receiveEmail ?? null,
  };
}

/** Where a Purchasing label goes: the receiving address, or (when none was set) the shipping address. */
export function purchasingReceiveAddress(o: OrgAddressRow | null | undefined): { address: AddressFields; source: "receiving" | "shipping" } | null {
  const own = ownReceivingAddressOf(o);
  if (own) return { address: own, source: "receiving" };
  const ship = shippingAddressOf(o);
  return ship ? { address: ship, source: "shipping" } : null;
}
