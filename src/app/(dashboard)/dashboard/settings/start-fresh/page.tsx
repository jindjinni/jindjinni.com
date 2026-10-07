import { requireOrg } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { START_FRESH_PHRASE, previewStartFresh } from "@/lib/start-fresh";
import { plural } from "@/lib/home-rules";
import { StartFreshForm } from "./start-fresh-form";

export const dynamic = "force-dynamic";

export default async function StartFreshPage() {
  const org = await requireOrg();
  if (!isOwner(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Only the owner can start fresh.</p>;
  }
  const p = await previewStartFresh(org.organizationId);
  const empty = p.quotations === 0 && p.receivingPackages === 0 && p.customers === 0;
  const goes: [string, string][] = [
    [String(p.quotations), `quotations${p.firstDay ? ` (${p.firstDay === p.lastDay ? p.firstDay : `${p.firstDay} to ${p.lastDay}`})` : ""}, with their items, files and shipping labels`],
    [String(p.customers), "customers those quotations were for"],
    [String(p.tracking), "tracking records"],
    [String(p.receivingPackages), `packages in Receiving, with ${plural(p.photos, "photo")}, scans, serial numbers, recall checks, adjustments and customer emails`],
    [String(p.paidOrders), "payment records in Accounts (they live on those packages)"],
    [String(p.auditLines), "audit-log lines about those quotations"],
  ];
  return (
    <div className="flex max-w-2xl flex-col gap-6" data-testid="start-fresh">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Start fresh</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Clear out the test quotations and everything they created, so {org.organizationName} is ready for real quotations and real packages.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Step 1: keep a copy (optional)</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">One Excel file of everything, in case you want to look back at the test data.</p>
        <a href="/api/settings/export" className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
          Download my data (.xlsx)
        </a>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-slate-900" data-testid="fresh-goes">
          <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Will be deleted</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {goes.map(([n, what]) => (
              <li key={what}>
                <span className="font-semibold tabular-nums">{n}</span> {what}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-5 dark:border-emerald-900 dark:bg-slate-900" data-testid="fresh-keeps">
          <h3 className="text-base font-semibold text-emerald-700 dark:text-emerald-400">Stays exactly as it is</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            <li>
              <span className="font-semibold tabular-nums">{p.keep.products}</span> products, with their prices and rules
            </li>
            <li>
              <span className="font-semibold tabular-nums">{p.keep.brands}</span> brands (categories), <span className="font-semibold tabular-nums">{p.keep.conditions}</span> conditions and the expiration ranges
            </li>
            <li>
              <span className="font-semibold tabular-nums">{p.keep.recalls}</span> recall notices
            </li>
            <li>
              Your team (<span className="font-semibold tabular-nums">{p.keep.team}</span> people) and their logins
            </li>
            <li>Settings, templates, Inventory, Sales, Marketing, HR, Chat and the industry news</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Step 2: clear the test data</h3>
        <StartFreshForm phrase={START_FRESH_PHRASE} empty={empty} companyName={org.organizationName} />
      </section>
    </div>
  );
}
