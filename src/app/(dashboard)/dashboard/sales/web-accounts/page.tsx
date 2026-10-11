import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteSales } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { getStorefront } from "@/lib/storefront-service";
import { listBuyerAccounts, type BuyerRow } from "@/lib/storefront-buyers";
import { BUYER_LABEL, type BuyerStatus } from "@/lib/storefront-buyer-rules";
import { decideBuyerAction, hideBuyerAction } from "@/app/actions/storefront";

export const dynamic = "force-dynamic";

const GROUPS: { status: BuyerStatus; blurb: string }[] = [
  { status: "PENDING", blurb: "Check the license, then approve or decline." },
  { status: "APPROVED", blurb: "Can sign in on your page." },
  { status: "SUSPENDED", blurb: "Switched off for now. Reactivate to let them back in." },
  { status: "DECLINED", blurb: "Not approved. You can still approve later." },
];

const when = (iso: string) => new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const NOTES: Record<string, string> = {
  approved: "Approved. The pharmacy was emailed and added to your Buyers.",
  "approved-noemail": "Approved and added to your Buyers, but the email to the pharmacy could not be sent. Let them know they can sign in on your page.",
  done: "Done.",
};

const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const btnMain = "rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700";

function Row({ b, canWrite }: { b: BuyerRow; canWrite: boolean }) {
  const st = b.status as BuyerStatus;
  return (
    <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="wa-row" data-email={b.email} data-status={b.status}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
        <span className="font-medium text-slate-900 dark:text-slate-50">{b.businessName}</span>
        {b.source === "API" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid="wa-via-api">From your website</span>}
        <span className="text-slate-500">{b.contactName}</span>
        <span className="text-xs text-slate-400">NPI {b.npi}</span>
        <span className="ml-auto text-xs text-slate-400">{when(b.createdAt)}</span>
        {b.hiddenAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Hidden</span>}
      </summary>
      <div className="border-t border-slate-100 px-4 py-4 text-sm dark:border-slate-800">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</dt><dd className="mt-0.5 break-all text-slate-800 dark:text-slate-100">{b.email}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Phone</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{b.phone ?? "Not given"}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Address</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{[b.street1, b.street2, `${b.city}, ${b.state} ${b.zip}`].filter(Boolean).join(", ")}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">NPI</dt><dd className="mt-0.5 font-mono text-slate-800 dark:text-slate-100">{b.npi}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">State license</dt><dd className="mt-0.5 font-mono text-slate-800 dark:text-slate-100" data-testid="wa-license">{b.licenseNumber} ({b.licenseState})</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">DEA</dt><dd className="mt-0.5 font-mono text-slate-800 dark:text-slate-100">{b.deaNumber}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">These numbers are only checked for typing mistakes. Look the license up with the state board before you approve.</p>
        {b.notes && <p className="mt-3 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{b.notes}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {b.salesBuyerId && <Link href={`/dashboard/sales/buyers/${b.salesBuyerId}`} className="text-sm font-medium text-amber-700 underline dark:text-amber-400" data-testid="wa-open-buyer">Open in Buyers</Link>}
          {canWrite && st === "PENDING" && (<><form action={decideBuyerAction.bind(null, b.id, "approve")}><button className={btnMain} data-testid="wa-approve">Approve</button></form><form action={decideBuyerAction.bind(null, b.id, "decline")}><button className={btn} data-testid="wa-decline">Decline</button></form></>)}
          {canWrite && st === "DECLINED" && <form action={decideBuyerAction.bind(null, b.id, "approve")}><button className={btnMain} data-testid="wa-approve">Approve instead</button></form>}
          {canWrite && st === "APPROVED" && <form action={decideBuyerAction.bind(null, b.id, "suspend")}><button className={btn} data-testid="wa-suspend">Suspend</button></form>}
          {canWrite && st === "SUSPENDED" && <form action={decideBuyerAction.bind(null, b.id, "reactivate")}><button className={btnMain} data-testid="wa-reactivate">Reactivate</button></form>}
          {canWrite && <form action={hideBuyerAction.bind(null, b.id, !b.hiddenAt)} className="ml-auto"><button className="text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" data-testid="wa-hide">{b.hiddenAt ? "Show again" : "Hide from the list"}</button></form>}
        </div>
      </div>
    </details>
  );
}

/** Pharmacies that applied for an account on the company's page. Grouped by where each one stands; nothing is deleted, only hidden. */
export default async function WebAccountsPage({ searchParams }: { searchParams: Promise<{ hidden?: string; note?: string }> }) {
  const org = await requireOrg();
  if (!(await featureOn("storefronts", org.organizationId))) notFound();
  const sp = await searchParams;
  const showHidden = sp.hidden === "1";
  const [rows, sf] = await Promise.all([listBuyerAccounts(org.organizationId, showHidden), getStorefront(org.organizationId)]);
  const canWrite = canWriteSales(org.role, org.access);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const live = !!sf && !sf.hiddenAt && !!sf.buyOpen;
  const note = sp.note ? (sp.note.startsWith("problem:") ? sp.note.slice(8) : NOTES[sp.note]) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Web accounts</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pharmacies that applied for an account on your page. Only approved pharmacies can sign in. Approving one adds it to your Buyers.</p>
      {note && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="status" data-testid="wa-note">{note}</p>}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="wa-page-info">
        {live ? <p className="text-slate-700 dark:text-slate-200">Pharmacies apply at <span className="break-all font-mono text-xs" data-testid="wa-page-url">{base}/s/{sf.handle}/apply</span>.</p>
          : <p className="text-slate-700 dark:text-slate-200">Applications are not open yet. {canWrite && <Link href="/dashboard/settings/storefront" className="font-medium text-amber-700 underline dark:text-amber-400">Open them in Settings</Link>}</p>}
      </div>
      <div className="mt-6 flex flex-col gap-6">
        {GROUPS.map((g) => {
          const items = rows.filter((r) => r.status === g.status);
          return (
            <details key={g.status} open={g.status === "PENDING"} data-testid={`wa-group-${g.status}`}>
              <summary className="flex cursor-pointer items-baseline gap-3 text-base font-semibold text-slate-900 dark:text-slate-50">
                {BUYER_LABEL[g.status]} <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid={`wa-count-${g.status}`}>{items.length}</span>
                <span className="text-xs font-normal text-slate-400">{g.blurb}</span>
              </summary>
              <div className="mt-3 flex flex-col gap-2">{items.length === 0 ? <p className="text-sm text-slate-400">Nothing here.</p> : items.map((r) => <Row key={r.id} b={r} canWrite={canWrite} />)}</div>
            </details>
          );
        })}
      </div>
      <p className="mt-8 text-sm text-slate-500">
        {showHidden ? <Link href="/dashboard/sales/web-accounts" className="underline">Hide the hidden ones again</Link> : <Link href="/dashboard/sales/web-accounts?hidden=1" className="underline" data-testid="wa-show-hidden">Show hidden accounts</Link>}
      </p>
    </div>
  );
}
