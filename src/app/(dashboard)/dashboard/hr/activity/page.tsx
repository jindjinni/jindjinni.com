import { requireOrg } from "@/lib/tenant";
import { todayIn } from "@/lib/payment-due";
import { activityFeed, companyZone, listPeople } from "@/lib/hr-service";
import { dayLabel, FEED_GROUPS, localDay, localTime, daysOf, ROLE_ORDER, type FeedKind } from "@/lib/hr-rules";
import { ROLE_LABELS } from "@/lib/permissions";
import { card, field, RangeBar, readRange, type RangeParams } from "../hr-ui";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, string> = {
  time: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  purchasing: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  receiving: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "customer-service": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  sales: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};
const groupOf = (k: FeedKind) => FEED_GROUPS.find((g) => g.kinds.includes(k)) ?? FEED_GROUPS[FEED_GROUPS.length - 1];

// Activity Log: every time-stamped thing people did, grouped under each person (closed, with their count and last action),
// opening to the lines in time order. Filter by person or by kind of work; picking a person opens their group.
export default async function ActivityPage({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const zone = await companyZone(org.organizationId);
  const today = todayIn(zone);
  const { kind, day } = readRange(sp, today);
  const { from, to } = daysOf(kind, day);
  const people = await listPeople(org.organizationId);
  const feed = await activityFeed(org.organizationId, from, to, zone, people);
  const person = people.find((p) => p.userId === sp.person)?.userId ?? "";
  const cat = FEED_GROUPS.find((g) => g.key === sp.kind)?.key ?? "";
  const rows = feed.filter((f) => (!person || f.userId === person) && (!cat || groupOf(f.kind).key === cat));
  const order = (r: string) => {
    const i = (ROLE_ORDER as readonly string[]).indexOf(r);
    return i === -1 ? 99 : i;
  };
  const shown = people
    .map((p) => ({ p, lines: rows.filter((f) => f.userId === p.userId) }))
    .filter((x) => x.lines.length > 0)
    .sort((a, b) => order(a.p.role) - order(b.p.role) || a.p.name.localeCompare(b.p.name));
  const search = { person: person || undefined, kind: cat || undefined };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Activity log</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Every action with the time it happened, under the person who did it. Times are in {zone.replace("_", " ")}.</p>
      </div>
      <RangeBar base="/dashboard/hr/activity" kind={kind} day={day} today={today} extra={search} />
      <form method="get" className="flex flex-wrap items-end gap-3" data-testid="hr-filters">
        <input type="hidden" name="range" value={kind} />
        <input type="hidden" name="day" value={day} />
        <div>
          <label htmlFor="f-person" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Person</label>
          <select id="f-person" name="person" defaultValue={person} className={`${field} mt-0.5 w-52`} data-testid="f-person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-kind" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Kind of action</label>
          <select id="f-kind" name="kind" defaultValue={cat} className={`${field} mt-0.5 w-52`} data-testid="f-kind">
            <option value="">All</option>
            {FEED_GROUPS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </div>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900" data-testid="f-apply">Filter</button>
      </form>
      {shown.length === 0 && <p className={`${card} p-4 text-sm text-slate-600 dark:text-slate-400`} data-testid="hr-empty">Nothing was recorded for this {kind}{person || cat ? " with that filter" : ""}.</p>}
      <div className="space-y-3" data-testid="hr-activity">
        {shown.map(({ p, lines }) => {
          const last = lines[0];
          let lastDay = "";
          return (
            <details key={p.userId} open={!!person} className={`${card} !p-0`} data-testid="hr-act-group" data-user={p.userId}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold text-slate-900 dark:text-slate-50">{p.name}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400" data-testid="hr-act-count">{lines.length} {lines.length === 1 ? "action" : "actions"}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">last {kind !== "day" ? `${dayLabel(localDay(last.at, zone))}, ` : ""}{localTime(last.at, zone)}</span>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm dark:divide-slate-800 dark:border-slate-800">
                {lines.map((l) => {
                  const d = localDay(l.at, zone);
                  const head = kind !== "day" && d !== lastDay ? d : null;
                  lastDay = d;
                  const g = groupOf(l.kind);
                  return (
                    <li key={l.id} data-testid="hr-act-line" data-kind={l.kind}>
                      {head && <p className="bg-slate-50 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">{dayLabel(head)}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                        <span className="w-20 shrink-0 tabular-nums text-slate-600 dark:text-slate-300" data-testid="hr-act-time">{localTime(l.at, zone)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_TONE[g.key]}`}>{g.label}</span>
                        <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-100">{l.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
