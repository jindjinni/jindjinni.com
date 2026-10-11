import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { getStorefront } from "@/lib/storefront-service";
import { normalizeHandle } from "@/lib/storefront-rules";
import { listApiKeys } from "@/lib/storefront-api";
import { originsFromText } from "@/lib/storefront-api-rules";
import { StorefrontForm } from "./storefront-form";
import { ConnectPanel } from "./connect-panel";

export const dynamic = "force-dynamic";

export default async function StorefrontSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role) || !(await featureOn("storefronts", org.organizationId))) notFound();
  const sf = await getStorefront(org.organizationId);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const keys = await listApiKeys(org.organizationId);
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Storefront</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Your company&rsquo;s public page. Share the address with sellers or link to it from your own website. What sellers send comes into your records for your team to review. Orders from approved pharmacies are confirmed automatically when everything is in stock (unless you set a review amount below); nothing is paid automatically.
      </p>
      <StorefrontForm
        initial={{ handle: sf?.handle ?? "", displayName: sf?.displayName ?? org.organizationName, welcomeText: sf?.welcomeText ?? "", sellOpen: sf?.sellOpen ?? false, buyOpen: !!sf?.buyOpen, ordersOpen: !!sf?.ordersOpen, orderReviewOver: sf?.orderReviewOver != null ? String(sf.orderReviewOver) : "", hidden: !!sf?.hiddenAt }}
        base={base}
        suggestion={normalizeHandle(org.organizationName)}
      />
      <ConnectPanel
        keys={keys.map((k) => ({ id: k.id, kind: k.kind, label: k.label, hint: k.hint, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt }))}
        origins={originsFromText(sf?.allowedOrigins).join("\n")}
        apiBase={base}
        hasStorefront={!!sf}
      />
    </div>
  );
}
