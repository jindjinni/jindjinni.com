import Link from "next/link";
import { notFound } from "next/navigation";
import { isPlatformStaff } from "@/lib/platform-admin";
import { INBOX_FILTERS, INBOX_PAGE_SIZE, inboxCounts, listInbox, parseInboxFilter, type InboxFilter } from "@/lib/support-service";
import { ticketLabel, whenText } from "@/lib/support-rules";
import { requireOrg } from "@/lib/tenant";
import { StatusPill } from "@/components/support-thread";

export const dynamic = "force-dynamic";

function href(p: { q?: string; filter?: InboxFilter; page?: number }) {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.filter && p.filter !== "needs") sp.set("filter", p.filter);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return `/dashboard/lamp/support${s ? `?${s}` : ""}`;
}

/** Every ticket from every company, with the company already attached. Platform owner only. */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformStaff(org))) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filter = parseInboxFilter(sp.filter);
  const [counts, list] = await Promise.all([inboxCounts(), listInbox({ q, filter, page: Number(sp.page) || 1 })]);
  const countFor: Record<InboxFilter, number> = { needs: counts.needs, waiting: counts.waiting, solved: counts.solved, all: counts.all };

  return (
    <div className="flex max-w-4xl flex-col gap-5" data-testid="support-inbox">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Support</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every ticket from every company, with the company&apos;s name and ID already attached. Open one to reply, leave an internal note, see the company&apos;s account standing and, if they allowed it, look at their account.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="ticket-search" className="sr-only">Search tickets</label>
        <input id="ticket-search" name="q" defaultValue={q} maxLength={80} placeholder="Search ticket number, company name or ID, email, title" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" data-testid="ticket-search" />
        {filter !== "needs" && <input type="hidden" name="filter" value={filter} />}
        <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900" data-testid="ticket-search-go">Search</button>
        {q && <Link href={href({ filter })} className="text-sm text-slate-600 underline dark:text-slate-300">Clear</Link>}
      </form>

      <nav aria-label="Filter tickets" className="flex flex-wrap gap-2">
        {INBOX_FILTERS.map((f) => (
          <Link key={f.key} href={href({ q, filter: f.key })} aria-current={filter === f.key ? "page" : undefined} data-testid={`ticket-filter-${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
            {f.label} <span className="tabular-nums text-xs opacity-70" data-testid={`ticket-count-${f.key}`}>{countFor[f.key]}</span>
          </Link>
        ))}
      </nav>

      <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="ticket-range">
        {list.total === 0 ? "No tickets match." : `Showing ${(list.page - 1) * INBOX_PAGE_SIZE + 1}–${(list.page - 1) * INBOX_PAGE_SIZE + list.rows.length} of ${list.total}`}
      </p>

      <ul className="flex flex-col gap-2">
        {list.rows.map((t) => (
          <li key={t.id}>
            <Link href={`/dashboard/lamp/support/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900" data-testid="inbox-item" data-status={t.status}>
              <span className="font-mono text-xs text-slate-500">{ticketLabel(t.ticketNo)}</span>
              <strong className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-50">{t.subject}</strong>
              {t.priority === "high" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-200">High</span>}
              <StatusPill status={t.status} />
              <span className="w-full text-xs text-slate-500 dark:text-slate-400">
                {t.organizationId ? (
                  <>
                    <span className="font-medium text-slate-700 dark:text-slate-200" data-testid="inbox-company">{t.companyName}</span>{" "}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800" data-testid="inbox-code">{t.companyCode}</span>
                  </>
                ) : (
                  <span className="font-medium text-amber-700 dark:text-amber-300" data-testid="inbox-company">Unknown company ({t.fromEmail})</span>
                )}
                {" · "}{t.fromName || t.fromEmail}{t.source === "email" ? " · by email" : ""} · {whenText(t.lastMessageAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {list.pages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
          {list.page > 1 ? <Link href={href({ q, filter, page: list.page - 1 })} className="underline" data-testid="ticket-prev">Previous</Link> : <span />}
          <span className="text-slate-500">Page {list.page} of {list.pages}</span>
          {list.page < list.pages ? <Link href={href({ q, filter, page: list.page + 1 })} className="underline" data-testid="ticket-next">Next</Link> : null}
        </nav>
      )}
    </div>
  );
}
