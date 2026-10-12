import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { blockSupportStaff } from "@/lib/staff-guard";
import { isAdmin } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { staffLevelOf } from "@/lib/platform-admin";
import { mayOpenSettings } from "@/lib/mothership-rules";
import { topLinksFor } from "@/lib/top-nav";
import { resolveTop } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { TopBarForm } from "./top-bar-form";

export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const org = await requireOrg();
  await blockSupportStaff(org);
  if (!isAdmin(org.role)) redirect("/dashboard/settings");
  const [shippingOn, showSupport, level, saved] = await Promise.all([featureOn("shipping", org.organizationId), featureOn("support-center", org.organizationId), staffLevelOf(org), getSavedSidebarMenus(org.organizationId)]);
  const links = topLinksFor(org, { shippingOn, showSupport, viewing: !!org.viewAs, level: level ?? null, lampLabel: "Lamp", settingsLabel: mayOpenSettings(level) ? "Settings" : "My account" });
  const rows = resolveTop(links, saved).filter((r) => r.id !== "lamp");
  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Menus</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Choose which departments show in the bar across the top, in what order, and what they are called. Put Accounts first if that is where your team starts.
        Hiding only takes a link out of the bar: nothing is deleted, and the department still works for anyone who has its address. Home and Settings always stay.
        Each department&rsquo;s own tabs are changed with the &ldquo;Edit menu&rdquo; button at the bottom of its left-hand menu.
      </p>
      <TopBarForm rows={rows.map((r) => ({ id: r.id, label: r.label, defaultLabel: r.defaultLabel, locked: r.locked, hidden: r.hidden }))} />
    </div>
  );
}
