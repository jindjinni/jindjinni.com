import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin, isPurchasingManager } from "@/lib/permissions";
import { isShippoConfigured } from "@/lib/shippo";
import { liveTrackingState } from "@/lib/tracking-service";
import { LiveTrackingCard } from "./live-tracking-card";

export const dynamic = "force-dynamic";

// Shipment Tracking (Setup): is Shippo connected, and are live updates switched on? Managers see it; an owner or
// admin presses the button.
export default async function ShipmentTrackingPage() {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const state = await liveTrackingState(process.env.APP_ORIGIN || `${proto}://${host}`);
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Shipment Tracking</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Every tracking number is followed through Shippo, and the package&apos;s status shows next to it on the quotation. When a package is delivered, it appears in Receiving → Delivered Today and starts the clock for paying the customer.
      </p>
      <LiveTrackingCard configured={isShippoConfigured()} on={state.on} problem={state.error ?? null} canChange={isAdmin(org.role)} />
    </div>
  );
}
