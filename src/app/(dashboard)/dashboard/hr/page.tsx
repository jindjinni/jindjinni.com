import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { todayIn } from "@/lib/payment-due";
import { companyZone, staffOverview, type StaffRow } from "@/lib/hr-service";
import { fmtDuration, localTime, METRIC_LABELS, ROLE_ORDER, type MetricKey } from "@/lib/hr-rules";
import { ROLE_LABELS } from "@/lib/permissions";
import { card, RangeBar, readRange, StatusPill, Tile, type RangeParams } from "./hr-ui";

export const dynamic = "force-dynamic";

// Staff Today: everyone with access, grouped by what they do, closed until opened. Each closed line shows how many are
// working, the hours and the work done; opening it shows a row per person (status, sign-in, clock in/out, breaks, hours, work counts).
export default async function StaffPage({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const zone = await companyZone(org.organizationId);
  const { kind, day } = readRange(sp, todayIn(zone));
  const view = await staffOverview(org.organizationId, kind, day);
  const live = kind === "day" && day === view.today;
  const roleKey = (r: string) => (r === "staff" ? "purchasing_agent" : r);
  const order = (r: string) => {
    const i = (ROLE_ORDER as readonly string[]).indexOf(r);
    return i === -1 ? 99 : i;
  };
  const groups = new Map<string, StaffRow[]>();
  for (const r of view.rows) groups.set(roleKey(r.person.role), [...(groups.get(roleKey(r.person.role)) ?? []), r]);
  const sorted = [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  const working = view.rows.filter((r) => r.stateNow === "WORKING").length;
  const onBreak = view.rows.filter((r) => r.stateNow === "BREAK").length;
  const clockedToday = view.rows.filter((r) => r.day.shifts.length > 0).length;
  const worked = view.rows.reduce((n, r) => n + r.day.workedMinutes, 0);
  const metricTotal = (rows: StaffRow[], m: MetricKey) => rows.reduce((n, r) => n + (r.counts[m] ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Staff {kind === "day" && day === view.today ? "today" : ""}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Everyone with access, their time clock and what they did. Times are in your company&apos;s time zone ({zone.replace("_", " ")}).</p>
      </div>
      <RangeBar base="/dashboard/hr" kind={kind} day={day} today={view.today} />
      <div className="grid gap-3 sm:grid-cols-4" data-testid="hr-tiles">
        {live ? <Tile label="Working now" value={working} sub={onBreak ? `${onBreak} on a break` : undefined} testid="hr-working" /> : <Tile label="People who clocked in" value={clockedToday} testid="hr-clocked" />}
        {live && <Tile label="Clocked in today" value={clockedToday} sub={`of ${view.rows.length} people`} testid="hr-clocked" />}
        {!live && <Tile label="People with access" value={view.rows.length} testid="hr-people" />}
        <Tile label="Hours worked" value={fmtDuration(worked)} sub="breaks taken off" testid="hr-hours" />
        <Tile label="Things done" value={view.feed.filter((f) => !["SIGN_IN", "CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"].includes(f.kind)).length} sub="quotations, orders, packages, emails..." testid="hr-things" />
      </div>
      <div className="space-y-3" data-testid="hr-groups">
        {sorted.map(([role, rows]) => {
          const metrics = [...new Set(rows.flatMap((r) => r.metrics))] as MetricKey[];
          const shown = metrics.filter((m) => rows.some((r) => r.metrics.includes(m)));
          // Owner and Admin do a bit of everything: only show the columns where they actually did something.
          const rolled = role === "owner" || role === "admin" ? shown.filter((m) => metricTotal(rows, m) > 0) : shown;
          const flagged = rows.filter((r) => r.day.forgotClockOut).length;
          return (
            <details key={role} className={`${card} !p-0`} data-testid="hr-group" data-role={role}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold text-slate-900 dark:text-slate-50">{ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{rows.length} {rows.length === 1 ? "person" : "people"}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{rows.filter((r) => r.stateNow !== "OUT").length} on the clock</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{fmtDuration(rows.reduce((n, r) => n + r.day.workedMinutes, 0))} worked</span>
                {rolled.filter((m) => metricTotal(rows, m) > 0).map((m) => (
                  <span key={m} className="text-sm text-slate-600 dark:text-slate-400">{metricTotal(rows, m)} {METRIC_LABELS[m].toLowerCase()}</span>
                ))}
                {flagged > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">{flagged} forgot to clock out</span>}
              </summary>
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Signed in</th>
                      <th className="px-2 py-2">Clocked in</th>
                      <th className="px-2 py-2">Breaks</th>
                      <th className="px-2 py-2">Clocked out</th>
                      <th className="px-2 py-2 text-right">Worked</th>
                      {rolled.map((m) => (
                        <th key={m} className="max-w-28 px-2 py-2 text-right leading-tight">{METRIC_LABELS[m]}</th>
                      ))}
                      <th className="px-4 py-2 text-right">Log</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.person.userId} className="border-t border-slate-100 dark:border-slate-800" data-testid="hr-person" data-user={r.person.userId}>
                        <td className="px-4 py-2"><span className="font-medium text-slate-900 dark:text-slate-50">{r.person.name}</span><span className="block text-xs text-slate-500">{r.person.email}</span></td>
                        <td className="px-2 py-2"><StatusPill status={r.status} /></td>
                        <td className="px-2 py-2 tabular-nums" data-testid="hr-signedin">{kind === "day" ? (r.signedInAt ? <>{localTime(r.signedInAt, zone)}{r.signIns > 1 && <span className="text-xs text-slate-500"> ({r.signIns}x)</span>}</> : <span className="text-slate-400">-</span>) : <span>{r.signIns}x</span>}</td>
                        <td className="px-2 py-2 tabular-nums" data-testid="hr-in">{kind === "day" ? (r.day.firstIn ? localTime(r.day.firstIn, zone) : <span className="text-slate-400">-</span>) : <span className="text-slate-400">-</span>}</td>
                        <td className="px-2 py-2 tabular-nums" data-testid="hr-breaks">{r.day.breakCount ? `${r.day.breakCount} · ${fmtDuration(r.day.breakMinutes)}` : <span className="text-slate-400">-</span>}</td>
                        <td className="px-2 py-2 tabular-nums" data-testid="hr-out">{kind !== "day" ? <span className="text-slate-400">-</span> : r.day.forgotClockOut ? <span className="font-semibold text-red-700 dark:text-red-300">no clock-out</span> : r.day.lastOut ? localTime(r.day.lastOut, zone) : <span className="text-slate-400">-</span>}</td>
                        <td className="px-2 py-2 text-right tabular-nums" data-testid="hr-worked">{r.day.workedMinutes ? fmtDuration(r.day.workedMinutes) : <span className="text-slate-400">-</span>}</td>
                        {rolled.map((m) => (
                          <td key={m} className="px-2 py-2 text-right tabular-nums" data-testid={`hr-m-${m}`}>{r.metrics.includes(m) ? r.counts[m] ?? 0 : <span className="text-slate-300 dark:text-slate-600">-</span>}</td>
                        ))}
                        <td className="px-4 py-2 text-right"><Link className="text-sm font-medium text-slate-800 underline dark:text-slate-200" href={`/dashboard/hr/activity?range=${kind}&day=${day}&person=${r.person.userId}`} data-testid="hr-log-link">Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
