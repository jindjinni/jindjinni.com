import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { ShipFromSettings } from "@/components/ship-from-settings";

export const dynamic = "force-dynamic";

// Shipping settings: the address every Shipping-department label goes FROM. We are always the sender here.
export default async function ShippingSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) notFound();
  return <ShipFromSettings organizationId={org.organizationId} />;
}
