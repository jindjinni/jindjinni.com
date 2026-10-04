import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing } from "@/lib/permissions";

// Home of the dashboard: Purchasing for everyone who can open it. A role with
// no department built yet (a Receiver, while Receiving is being built) lands
// on a short explanation instead of an error.
export default async function DashboardIndexPage() {
  const org = await requireOrg();
  if (canViewPurchasing(org.role)) redirect("/dashboard/purchasing");

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Welcome to {org.organizationName}</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">
        Your account is set up as a Receiver. The Receiving department is still being built &mdash; as soon as it&rsquo;s
        ready, it will appear here in your menu.
      </p>
    </div>
  );
}
