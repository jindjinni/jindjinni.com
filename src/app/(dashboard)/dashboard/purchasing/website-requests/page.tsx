import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canRevealBankDetails, canWritePurchasing } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { getStorefront, listWebsiteRequests, type RequestRow } from "@/lib/storefront-service";
import { REQUEST_LABEL, type RequestStatus } from "@/lib/storefront-rules";
import { payoutSummaries, type PayoutSummary } from "@/lib/storefront-payouts";
import { maskedLine } from "@/lib/bank-rules";
import { BankBox } from "./bank-box";
import { declineRequestAction, hideRequestAction, makeQuotationAction, reopenRequestAction } from "@/app/actions/storefront";

export const dynamic = "force-dynamic";

const GROUPS: { status: RequestStatus; blurb: string }[] = [
  { status: "NEW", blurb: "Waiting for you. Make a quotation, or decline." },
  { status: "QUOTED", blurb: "A quotation was made from these." },
  { status: "DECLINED", blurb: "Set aside. You can reopen one." },
];

const when = (iso: string) => new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function Row({ r, canWrite, bank, canReveal }: { r: RequestRow; canWrite: boolean; bank?: PayoutSummary; canReveal: boolean }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="wr-row" data-reference={r.reference} data-status={r.status}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
        <span className="font-mono text-xs font-semibold text-slate-500">{r.reference}</span>
        <span className="font-medium text-slate-900 dark:text-slate-50">{r.businessName}</span>
        {r.isDonation && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="wr-donation">Donation</span>}
        {r.source === "API" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid="wr-via-api">From your website</span>}
        <span className="text-slate-500">{r.contactName}</span>
        <span className="ml-auto text-xs text-slate-400">{when(r.createdAt)}</span>
        {r.hiddenAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Hidden</span>}
      </summary>
      <div className="border-t border-slate-100 px-4 py-4 text-sm dark:border-slate-800">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</dt><dd className="mt-0.5 break-all text-slate-800 dark:text-slate-100">{r.email}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Phone</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{r.phone ?? "Not given"}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Address</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{[r.street1, r.street2, `${r.city}, ${r.state} ${r.zip}`].filter(Boolean).join(", ")}</dd></div>
        </dl>
        <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">What they have</h3>
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-800 dark:bg-slate-950 dark:text-slate-100" data-testid="wr-items">{r.itemsText}</p>
        {r.notes && (<><h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Their note</h3><p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{r.notes}</p></>)}
        {bank && <BankBox requestId={r.id} line={maskedLine(bank.accountType, bank.accountLast4)} canReveal={canReveal} erased={!!bank.erasedAt} />}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {r.quotationId && <Link href={`/dashboard/purchasing/quotations/${r.quotationId}`} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700" data-testid="wr-open-quote">Open the quotation</Link>}
          {canWrite && r.status === "NEW" && (
            <>
              <form action={makeQuotationAction.bind(null, r.id)}><button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700" data-testid="wr-make-quote">Make a quotation</button></form>
              <form action={declineRequestAction.bind(null, r.id)}><button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" data-testid="wr-decline">Decline</button></form>
            </>
          )}
          {canWrite && r.status === "DECLINED" && (
            <form action={reopenRequestAction.bind(null, r.id)}><button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" data-testid="wr-reopen">Reopen</button></form>
          )}
          {canWrite && (
            <form action={hideRequestAction.bind(null, r.id, !r.hiddenAt)} className="ml-auto">
              <button className="text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" data-testid="wr-hide">{r.hiddenAt ? "Show again" : "Hide from the list"}</button>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}

/** What visitors sent through the company's "sell to us" page. Grouped by what still needs doing; nothing is ever deleted, only hidden. */
export default async function WebsiteRequestsPage({ searchParams }: { searchParams: Promise<{ hidden?: string; problem?: string }> }) {
  const org = await requireOrg();
  if (!(await featureOn("storefronts", org.organizationId))) notFound();
  const sp = await searchParams;
  const showHidden = sp.hidden === "1";
  const [rows, storefront] = await Promise.all([listWebsiteRequests(org.organizationId, showHidden), getStorefront(org.organizationId)]);
  const canWrite = canWritePurchasing(org.role, org.access);
  const canReveal = !org.viewAs && canRevealBankDetails(org.role, org.access);
  const banks = await payoutSummaries(org.organizationId, rows.map((r) => r.id));
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const live = !!storefront && !storefront.hiddenAt && storefront.sellOpen;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Other website requests</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Offers sellers sent as a typed list through your &ldquo;sell to us&rdquo; page. Orders from the automatic checkout are in Website orders. Make a quotation from one and it opens like any other quotation, with the seller&rsquo;s list in its notes.</p>

      {sp.problem && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="alert" data-testid="wr-problem">{sp.problem}</p>}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="wr-page-info">
        {live ? (
          <p className="text-slate-700 dark:text-slate-200">Your page is open at <span className="break-all font-mono text-xs" data-testid="wr-page-url">{base}/s/{storefront.handle}/sell</span>. Share this address, or link to it from your website.</p>
        ) : (
          <p className="text-slate-700 dark:text-slate-200">Your &ldquo;sell to us&rdquo; page is not open yet. {canWrite && <Link href="/dashboard/settings/storefront" className="font-medium text-emerald-700 underline dark:text-emerald-400">Set it up in Settings</Link>}</p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {GROUPS.map((g) => {
          const items = rows.filter((r) => r.status === g.status);
          return (
            <details key={g.status} open={g.status === "NEW"} className="group" data-testid={`wr-group-${g.status}`}>
              <summary className="flex cursor-pointer items-baseline gap-3 text-base font-semibold text-slate-900 dark:text-slate-50">
                {REQUEST_LABEL[g.status]} <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid={`wr-count-${g.status}`}>{items.length}</span>
                <span className="text-xs font-normal text-slate-400">{g.blurb}</span>
              </summary>
              <div className="mt-3 flex flex-col gap-2">
                {items.length === 0 ? <p className="text-sm text-slate-400">Nothing here.</p> : items.map((r) => <Row key={r.id} r={r} canWrite={canWrite} bank={banks.get(r.id)} canReveal={canReveal} />)}
              </div>
            </details>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        {showHidden ? <Link href="/dashboard/purchasing/website-requests" className="underline">Hide the hidden ones again</Link> : <Link href="/dashboard/purchasing/website-requests?hidden=1" className="underline" data-testid="wr-show-hidden">Show hidden requests</Link>}
      </p>
    </div>
  );
}
