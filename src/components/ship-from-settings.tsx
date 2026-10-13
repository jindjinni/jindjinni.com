import Link from "next/link";
import { updateBusinessSettings } from "@/app/actions/settings";
import { BusinessSettingsForm } from "@/app/(dashboard)/dashboard/settings/business/business-settings-form";
import { addressFormValues } from "@/lib/address-prefill";

/** The Shipping department address: every label made in Shipping (returns to customers, shipments to suppliers and distributors) goes FROM here. */
export async function ShipFromSettings({ organizationId }: { organizationId: string }) {
  const { values, prefilled } = await addressFormValues(organizationId, "shipFrom");
  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Shipping address (we are the sender)</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Every label made in the <strong>Shipping department</strong> goes <strong>from this address</strong>: a return to a customer, a shipment to a supplier, a shipment to a distributor.
        The other side is always the receiver. Fill it in once here.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        When a customer sells to you (Purchasing), that is the other way around: the customer is the sender and you are the receiver. That address is set in{" "}
        <Link href="/dashboard/purchasing/shipping-settings" className="font-medium text-emerald-800 underline dark:text-emerald-300">Purchasing → Shipping settings</Link>.
      </p>
      {prefilled && (
        <p className="mt-3 max-w-2xl rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">We filled this in from your business profile. Check it, then press Save.</p>
      )}
      <BusinessSettingsForm action={updateBusinessSettings} values={values} />
    </div>
  );
}
