import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { carriersLabel, shippoConnectionView } from "@/lib/shippo-connection";
import { ConnectGuide } from "@/components/connect-guide";
import { ShippoConnector } from "./shippo-connector";

export const dynamic = "force-dynamic";

/** Purchasing -> Settings -> Connectors: the accounts Purchasing runs on. Today that is the company's own Shippo. Owner and Admin only. */
export default async function PurchasingConnectorsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) notFound();
  const view = await shippoConnectionView(org.organizationId);
  return (
    <div className="flex max-w-2xl flex-col gap-6" data-testid="dept-connectors-purchasing">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Connectors</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The accounts Purchasing runs on. {org.organizationName} plugs in its own login, so nothing here is shared with any other company.</p>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Shippo connector</h2>
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
      <ConnectGuide guideKey="shippo" open={view.source !== "company" || view.status !== "ACTIVE"} />
    </div>
  );
}
