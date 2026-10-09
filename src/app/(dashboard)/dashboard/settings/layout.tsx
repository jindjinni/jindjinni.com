import { requireOrg } from "@/lib/tenant";
import { settingsSectionsFor } from "@/lib/permissions";
import { staffLevelOf } from "@/lib/platform-admin";
import { isFullLevel, mayOpenSettings } from "@/lib/mothership-rules";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const level = await staffLevelOf(org);
  let sections = settingsSectionsFor(org.role);
  // Customer support (mothership) never sees the company Settings, only their own account page.
  if (!mayOpenSettings(level)) sections = sections.filter((s) => s.href === "/dashboard/settings/account");
  // The mothership's own pages (Companies, Support, Staff) are in the Mothership tab. Owner, co-owner and admin also get these two:
  if (isFullLevel(level)) {
    sections.push({ href: "/dashboard/settings/features", label: "Feature rollout", blurb: "Switch new features on in stages." });
    sections.push({ href: "/dashboard/settings/jin-library", label: "Jin library", blurb: "What Jin knows about the industry." });
  }
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <aside className="md:w-52 md:shrink-0">
        <h1 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-50">{mayOpenSettings(level) ? "Settings" : "My account"}</h1>
        <SettingsNav sections={sections.map(({ href, label }) => ({ href, label }))} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
