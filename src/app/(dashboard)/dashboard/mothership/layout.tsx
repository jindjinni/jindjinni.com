import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { staffLevelOf } from "@/lib/platform-admin";
import { LEVEL_LABELS, mayOpenStaffPage } from "@/lib/mothership-rules";
import { waitingCount } from "@/lib/company-admin";
import { inboxCounts } from "@/lib/support-service";
import { MothershipTabs } from "./mothership-tabs";

export const dynamic = "force-dynamic";

/** The mothership's own area: every company, every support ticket and the staff. Only for the Owner, co-owners, admins and customer support. */
export default async function MothershipLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg({ real: true });
  const level = await staffLevelOf(org);
  if (!level) notFound();
  const [waiting, support] = await Promise.all([waitingCount(), inboxCounts()]);
  const tabs = [
    { href: "/dashboard/mothership/companies", label: "Companies", badge: waiting },
    { href: "/dashboard/mothership/support", label: "Support", badge: support.needs },
    ...(mayOpenStaffPage(level) ? [{ href: "/dashboard/mothership/staff", label: "Staff", badge: 0 }] : []),
  ];
  return (
    <div className="flex flex-col gap-5" data-testid="mothership">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Mothership</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">The platform&apos;s own desk: every company, every ticket, and the team that looks after them.</p>
        </div>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" data-testid="my-level">{LEVEL_LABELS[level]}</span>
      </div>
      <MothershipTabs tabs={tabs} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
