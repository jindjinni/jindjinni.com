import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { getStorefront } from "@/lib/storefront-service";
import { normalizeHandle } from "@/lib/storefront-rules";
import { StorefrontForm } from "./storefront-form";

export const dynamic = "force-dynamic";

export default async function StorefrontSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role) || !(await featureOn("storefronts", org.organizationId))) notFound();
  const sf = await getStorefront(org.organizationId);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Storefront</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Your company&rsquo;s public page. Share the address with sellers or link to it from your own website. What visitors send comes into your records for your team to review; nothing is bought, sold or paid automatically.
      </p>
      <StorefrontForm
        initial={{ handle: sf?.handle ?? "", displayName: sf?.displayName ?? org.organizationName, welcomeText: sf?.welcomeText ?? "", sellOpen: sf?.sellOpen ?? false, buyOpen: !!sf?.buyOpen, hidden: !!sf?.hiddenAt }}
        base={base}
        suggestion={normalizeHandle(org.organizationName)}
      />
    </div>
  );
}
