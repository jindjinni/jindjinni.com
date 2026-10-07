import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { carriersLabel, shippoConnectionView } from "@/lib/shippo-connection";
import { ShippoConnector } from "./shippo-connector";

export const dynamic = "force-dynamic";

/** Settings -> Shipping: plug the company's own Shippo account into the platform. Owner and Admin only. */
export default async function ShippingSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) redirect("/dashboard");
  const view = await shippoConnectionView(org.organizationId);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Shipping labels</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Plug in your own Shippo account to buy UPS and USPS labels for your customers and follow their packages. Labels are bought and billed in
          <strong> your</strong> Shippo account. We never see your card or payment details.
        </p>
      </div>
      <ShippoConnector
        source={view.source}
        status={view.status}
        keyHint={view.keyHint}
        isTest={view.isTest}
        carriers={carriersLabel(view.carriers)}
        lastError={view.lastError}
        webhookOn={view.webhookOn}
        connectedAt={view.connectedAt}
        companyName={org.organizationName}
      />
    </div>
  );
}
