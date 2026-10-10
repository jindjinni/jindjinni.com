import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { staffLevelOf } from "@/lib/platform-admin";
import { LEVEL_LABELS, isFullLevel, mayOpenStaffPage } from "@/lib/mothership-rules";
import { waitingCount } from "@/lib/company-admin";
import { inboxCounts } from "@/lib/support-service";
import { LampTabs } from "./lamp-tabs";

export const dynamic = "force-dynamic";

/** The Lamp (the platform's own desk): every company, every support ticket and the staff. Only for the Owner, co-owners, admins and customer support. */
export default async function LampLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg({ real: true });
  const level = await staffLevelOf(org);
  if (!level) notFound();
  const [waiting, support] = await Promise.all([waitingCount(), inboxCounts()]);
  const tabs = [
    { href: "/dashboard/lamp/companies", label: "Companies", badge: waiting },
    { href: "/dashboard/lamp/support", label: "Support", badge: support.needs },
    ...(isFullLevel(level) ? [{ href: "/dashboard/lamp/pricing", label: "Pricing", badge: 0 }] : []),
    ...(mayOpenStaffPage(level) ? [{ href: "/dashboard/lamp/staff", label: "Staff", badge: 0 }] : []),
  ];
  return (
    <div className="flex flex-col gap-5" data-testid="mothership">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">The Lamp</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">The platform&apos;s own desk: every company, every ticket, and the team that looks after them.</p>
        </div>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" data-testid="my-level">{LEVEL_LABELS[level]}</span>
      </div>
      <LampTabs tabs={tabs} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
