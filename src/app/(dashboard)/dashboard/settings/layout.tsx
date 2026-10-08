import { requireOrg } from "@/lib/tenant";
import { settingsSectionsFor } from "@/lib/permissions";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { SettingsNav } from "./settings-nav";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const sections = settingsSectionsFor(org.role);
  // Only the platform owner sees Jin's library.
  if (await isPlatformAdmin(org)) {
    const waiting = (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.approvalStatus, "pending"))).length;
    sections.push({ href: "/dashboard/settings/approvals", label: waiting ? `Approvals (${waiting})` : "Approvals", blurb: "New companies waiting for your OK." });
    sections.push({ href: "/dashboard/settings/jin-library", label: "Jin library", blurb: "What Jin knows about the industry." });
  }
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <aside className="md:w-52 md:shrink-0">
        <h1 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-50">Settings</h1>
        <SettingsNav sections={sections.map(({ href, label }) => ({ href, label }))} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
