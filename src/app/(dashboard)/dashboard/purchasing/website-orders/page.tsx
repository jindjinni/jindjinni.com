import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { featureOn } from "@/lib/features";
import { canWritePurchasing } from "@/lib/permissions";
import { getStorefront } from "@/lib/storefront-service";
import { countFlagged, listWebsiteOrders } from "@/lib/website-orders-service";
import { money } from "@/lib/checkout-rules";
import { db } from "@/db/client";
import { websiteRequests } from "@/db/schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Pill({ children, tone, testid }: { children: React.ReactNode; tone: "ok" | "warn" | "bad" | "plain"; testid?: string }) {
  const c = { ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100", warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100", bad: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100", plain: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c}`} data-testid={testid}>{children}</span>;
}

/**
 * Orders that arrived through the automatic website checkout (the hosted page or the company's own site). They appear by themselves: a
 * quotation is already made and the free label already bought. Click one to see the quotation, label and tracking, or to email a copy.
 * Orders staff make by hand stay in Quotations.
 */
export default async function WebsiteOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; hidden?: string; flagged?: string }> }) {
  const org = await requireOrg();
  if (!(await featureOn("storefronts", org.organizationId))) notFound();
  const sp = await searchParams;
  const [rows, flagged, storefront, [other]] = await Promise.all([
    listWebsiteOrders(org.organizationId, { includeHidden: sp.hidden === "1", q: sp.q, flaggedOnly: sp.flagged === "1" }),
    countFlagged(org.organizationId),
    getStorefront(org.organizationId),
    db.select({ n: sql<number>`count(*)` }).from(websiteRequests).where(and(eq(websiteRequests.organizationId, org.organizationId), eq(websiteRequests.status, "NEW"), isNull(websiteRequests.hiddenAt), ne(sql`coalesce(${websiteRequests.kind}, '')`, "ORDER"))),
  ]);
  const canWrite = canWritePurchasing(org.role, org.access);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const live = !!storefront && !storefront.hiddenAt && storefront.checkoutOpen;
  const waiting = Number(other?.n ?? 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Website orders</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Orders customers placed on your website checkout. Each one already has its quotation and free shipping label, so nothing is waiting for you. Orders made by hand by your team are in Quotations.</p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="wo-page-info">
        {live ? (
          <p className="text-slate-700 dark:text-slate-200">Your checkout is open at <span className="break-all font-mono text-xs" data-testid="wo-page-url">{base}/s/{storefront.handle}/checkout</span>. Link to it from your website, or connect your own site to it in Settings &rarr; Storefront.</p>
        ) : (
          <p className="text-slate-700 dark:text-slate-200">Your automatic checkout is not open yet. {canWrite && <Link href="/dashboard/settings/storefront" className="font-medium text-emerald-700 underline dark:text-emerald-400">Switch it on in Settings</Link>}</p>
        )}
      </div>

      {flagged > 0 && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="wo-flagged-note">
          {flagged} order{flagged === 1 ? "" : "s"} marked &ldquo;Look at this&rdquo;. <Link href="/dashboard/purchasing/website-orders?flagged=1" className="font-medium underline">Show only those</Link>
        </p>
      )}

      <form className="mt-4 flex flex-wrap items-center gap-2" data-testid="wo-search-form">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search by order, name, email, quotation or tracking number" className="min-w-[260px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Search website orders" data-testid="wo-search" />
        {sp.hidden === "1" && <input type="hidden" name="hidden" value="1" />}
        {sp.flagged === "1" && <input type="hidden" name="flagged" value="1" />}
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Search</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[820px] text-left text-sm" data-testid="wo-table">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <th className="px-4 py-2 font-medium">Order</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 text-right font-medium">Payout</th>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Package</th>
              <th className="px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400" data-testid="wo-empty">{sp.q || sp.flagged ? "No order matches." : "No website orders yet. They show up here by themselves."}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50" data-testid="wo-row" data-reference={r.reference}>
                <td className="px-4 py-3"><Link href={`/dashboard/purchasing/website-orders/${r.reference}`} className="font-mono text-xs font-semibold text-emerald-700 underline dark:text-emerald-400" data-testid="wo-open">{r.reference}</Link><span className="block text-xs text-slate-400">{r.quotationNumber}</span></td>
                <td className="px-4 py-3"><span className="block text-slate-900 dark:text-slate-50">{r.businessName}</span><span className="block text-xs text-slate-500">{r.contactName}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500">{when(r.createdAt)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(r.total)}</td>
                <td className="px-4 py-3">{r.labelStatus === "GENERATED" ? <Pill tone="ok">Made</Pill> : r.labelStatus === "ERROR" ? <Pill tone="bad">Failed</Pill> : <Pill tone="warn">Waiting</Pill>}{r.trackingNumber && <span className="mt-1 block font-mono text-xs text-slate-500">{r.trackingNumber}</span>}</td>
                <td className="px-4 py-3">{r.quotationStatus === "CANCELLED" ? <Pill tone="bad">Cancelled</Pill> : r.quotationStatus === "RECEIVED" ? <Pill tone="ok">Received</Pill> : <Pill tone="plain">{r.packageStatus}</Pill>}</td>
                <td className="px-4 py-3">{r.flagReason ? <Pill tone="warn" testid="wo-flag">Look at this</Pill> : null}{r.source === "API" && <span className="ml-1"><Pill tone="plain">Your site</Pill></span>}{r.hiddenAt && <span className="ml-1"><Pill tone="plain">Hidden</Pill></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
        {sp.hidden === "1" ? <Link href="/dashboard/purchasing/website-orders" className="underline">Hide the hidden ones again</Link> : <Link href="/dashboard/purchasing/website-orders?hidden=1" className="underline" data-testid="wo-show-hidden">Show hidden orders</Link>}
        <Link href="/dashboard/purchasing/website-requests" className="underline" data-testid="wo-other-link">Other website requests (typed lists){waiting > 0 ? `: ${waiting} waiting` : ""}</Link>
      </p>
    </div>
  );
}
