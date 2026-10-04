import { requireOrg } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { CLOSE_GRACE_DAYS } from "@/lib/legal";
import { CloseCompanyForm } from "./close-company-form";

export default async function CloseCompanyPage() {
  const org = await requireOrg();
  if (!isOwner(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Only the owner can close the company.</p>;
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Close company</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Take a copy of your data first, then close the account if you&rsquo;re sure.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Download all your data</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          One Excel file with a sheet for each kind of record: customers, quotations and their items, products,
          prices, rules, your team and more. Logos and password information are not included.
        </p>
        <a
          href="/api/settings/export"
          className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Download my data (.xlsx)
        </a>
      </section>

      <section className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Close {org.organizationName}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>Everyone on your team is locked out straight away, and pending invitations are cancelled.</li>
          <li>Your data is kept for {CLOSE_GRACE_DAYS} days. Sign in during that time and you can reopen the company with everything as you left it.</li>
          <li>After {CLOSE_GRACE_DAYS} days all of your company&rsquo;s data is permanently deleted and can&rsquo;t be recovered, by you or by us.</li>
          <li>Shipping labels already bought stay with your shipping provider; closing doesn&rsquo;t refund them.</li>
        </ul>
        <CloseCompanyForm companyName={org.organizationName} />
      </section>
    </div>
  );
}
