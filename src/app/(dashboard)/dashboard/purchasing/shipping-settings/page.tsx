import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin, isPurchasingManager } from "@/lib/permissions";
import { addressFormValues } from "@/lib/address-prefill";
import { updateReceivingSettings, clearReceivingSettings } from "@/app/actions/settings";
import { ReceivingForm } from "./receiving-form";

export const dynamic = "force-dynamic";

// Purchasing → Shipping settings: where customers ship their supplies TO. The customer is always the sender and we are always the receiver.
export default async function PurchasingShippingSettingsPage() {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) notFound();
  const { values, prefilled, sameAsShipping, hasOwnReceiving } = await addressFormValues(org.organizationId, "receive");
  const admin = isAdmin(org.role);
  return (
    <div className="max-w-3xl" data-testid="purchasing-shipping-settings">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Shipping settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        This is the address your customers ship their supplies <strong>to</strong>. When you send a quotation and make the customer&apos;s free shipping label, the label always goes{" "}
        <strong>from the customer</strong> <strong>to this address</strong>: the customer is the sender and your company is the receiver.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Labels you make in the Shipping department go the other way (your company is always the sender). That address is in{" "}
        <Link href="/dashboard/shipping/settings" className="font-medium text-emerald-800 underline dark:text-emerald-300">Shipping → Shipping settings</Link>.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        The email that carries the label to the customer is explained in{" "}
        <Link href="/dashboard/settings/email-flow" className="font-medium text-emerald-800 underline dark:text-emerald-300">Settings → How our emails work</Link>.
      </p>
      {!hasOwnReceiving && !prefilled && (
        <p className="mt-3 max-w-2xl rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300" data-testid="receive-empty">No receiving address is saved yet. Add it below before you make a customer&apos;s label.</p>
      )}
      {prefilled && (
        <p className="mt-3 max-w-2xl rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300" data-testid="receive-prefilled">
          {sameAsShipping ? "We filled this in from your Shipping address. Check it, then press Save to keep it as your receiving address." : "We filled this in from your business profile. Check it, then press Save."}
        </p>
      )}
      {!hasOwnReceiving && prefilled && sameAsShipping && (
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Until you save a receiving address, customer labels use your Shipping address.</p>
      )}
      {admin ? (
        <ReceivingForm save={updateReceivingSettings} clear={clearReceivingSettings} values={values} hasOwn={hasOwnReceiving} />
      ) : (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Only an owner or an admin can change this address.</p>
      )}
    </div>
  );
}
