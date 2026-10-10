import Link from "next/link";
import { notFound } from "next/navigation";
import { ConnectGuide } from "@/components/connect-guide";
import { MailTime } from "@/components/mail/mail-time";
import { featureOn } from "@/lib/features";
import { DEPT_LABEL, MAIL_DEPTS } from "@/lib/mail-rules";
import { OVERVIEW_PAGE, overviewCounts, overviewList, parseOverviewFilter, type OverviewFilter } from "@/lib/mail-overview";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { requireOrg } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function href(f: Partial<OverviewFilter>, page = 1) {
  const sp = new URLSearchParams();
  if (f.dept && f.dept !== "all") sp.set("dept", f.dept);
  if (f.dir && f.dir !== "all") sp.set("dir", f.dir);
  if (f.q) sp.set("q", f.q);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return `/dashboard/lamp/mail${s ? `?${s}` : ""}`;
}

const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-300 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"}`;

/**
 * The Lamp's overall inbox: what came in and went out of the platform's OWN company's department mailboxes. Read only. It never
 * shows another company's mail and never a person's personal mailbox.
 */
export default async function LampMailPage({ searchParams }: { searchParams: Promise<{ dept?: string; dir?: string; q?: string; page?: string }> }) {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformAdmin(org)) || !(await featureOn("mailboxes", org.organizationId))) notFound();
  const f = parseOverviewFilter(await searchParams);
  const [counts, { rows, total }] = await Promise.all([overviewCounts(org.organizationId), overviewList(org.organizationId, f)]);
  const pages = Math.max(1, Math.ceil(total / OVERVIEW_PAGE));

  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="lamp-mail">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Overall inbox</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Everything that came into and went out of {org.organizationName}&apos;s own department mailboxes, in one place. You can read it here; to answer, open the department&apos;s Mail tab. Other companies&apos; mail is never shown here, and neither are people&apos;s personal mailboxes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="mail-depts">
        <Link href={href({ ...f, dept: "all" })} className={chip(f.dept === "all")}>All departments</Link>
        {MAIL_DEPTS.map((d) => (
          <Link key={d} href={href({ ...f, dept: d })} className={chip(f.dept === d)} data-testid={`dept-${d}`}>
            {DEPT_LABEL[d]} <span className="text-xs text-slate-500 tabular-nums" data-testid={`counts-${d}`}>{counts[d]?.in ?? 0} in · {counts[d]?.out ?? 0} out</span>
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2" role="search">
        {f.dept !== "all" && <input type="hidden" name="dept" value={f.dept} />}
        <label htmlFor="ov-dir" className="sr-only">Direction</label>
        <select id="ov-dir" name="dir" defaultValue={f.dir} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <option value="all">Incoming and outgoing</option>
          <option value="IN">Incoming only</option>
          <option value="OUT">Outgoing only</option>
        </select>
        <label htmlFor="ov-q" className="sr-only">Search mail</label>
        <input id="ov-q" name="q" defaultValue={f.q} placeholder="Search subject or address" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Search</button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" data-testid="ov-empty">
          Nothing here yet. Mail appears once a department&apos;s shared mailbox is connected and has sent or received something.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" data-testid="ov-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/lamp/mail/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60" data-testid="ov-row" data-dir={r.direction} data-dept={r.dept}>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.direction === "IN" ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`}>{r.direction === "IN" ? "In" : "Out"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-200">{r.who}</p>
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{r.subject}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.snippet}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                  <p><MailTime iso={r.at} /></p>
                  <p>{DEPT_LABEL[r.dept]}</p>
                  {r.source === "SYSTEM" && <p>sent by the app</p>}
                  {r.hasFiles && <p aria-label="Has attachments">📎</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {f.page > 1 ? <Link href={href(f, f.page - 1)} className="underline">&larr; Newer</Link> : <span />}
          <span className="text-slate-500">Page {f.page} of {pages}</span>
          {f.page < pages ? <Link href={href(f, f.page + 1)} className="underline">Older &rarr;</Link> : <span />}
        </nav>
      )}
      <ConnectGuide guideKey="cron-ping" />
    </div>
  );
}
