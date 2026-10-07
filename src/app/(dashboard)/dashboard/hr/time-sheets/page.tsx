import { requireOrg } from "@/lib/tenant";
import { todayIn } from "@/lib/payment-due";
import { companyZone, timesheet } from "@/lib/hr-service";
import { dayLabel, fmtDuration, localTime, ROLE_ORDER, type RangeKind } from "@/lib/hr-rules";
import { ROLE_LABELS } from "@/lib/permissions";
import { card, RangeBar, readRange, Tile, type RangeParams } from "../hr-ui";

export const dynamic = "force-dynamic";

// Time Sheets: hours per person per day for a week or a month. One closed line per person with their total hours,
// opening to a row per day (clocked in, breaks, clocked out, worked). A shift that was never closed is flagged in red.
export default async function TimeSheetsPage({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const zone = await companyZone(org.organizationId);
  const today = todayIn(zone);
  const r = readRange(sp, today);
  const kind: RangeKind = r.kind === "day" ? "week" : r.kind;
  const sheet = await timesheet(org.organizationId, kind, r.day);
  const order = (role: string) => {
    const i = (ROLE_ORDER as readonly string[]).indexOf(role);
    return i === -1 ? 99 : i;
  };
  const people = [...sheet.people].sort((a, b) => order(a.person.role) - order(b.person.role) || a.person.name.localeCompare(b.person.name));
  const total = people.reduce((n, p) => n + p.workedMinutes, 0);
  const daysWorked = people.reduce((n, p) => n + p.days.filter((d) => d.summary.shifts.length).length, 0);
  const flagged = people.reduce((n, p) => n + p.days.filter((d) => d.summary.forgotClockOut).length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Time sheets</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Hours from the time clock, breaks taken off. A shift counts for the day it started.</p>
      </div>
      <RangeBar base="/dashboard/hr/time-sheets" kind={kind} day={r.day} today={today} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Total hours" value={fmtDuration(total)} testid="ts-total" />
        <Tile label="Days worked" value={daysWorked} sub="person-days" testid="ts-days" />
        <Tile label="Forgot to clock out" value={flagged} sub={flagged ? "fix with the person" : "none"} testid="ts-flagged" />
      </div>
      <div className="space-y-3" data-testid="ts-people">
        {people.map((p) => {
          const bad = p.days.filter((d) => d.summary.forgotClockOut).length;
          return (
            <details key={p.person.userId} className={`${card} !p-0`} data-testid="ts-person" data-user={p.person.userId}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold text-slate-900 dark:text-slate-50">{p.person.name}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{ROLE_LABELS[p.person.role as keyof typeof ROLE_LABELS] ?? p.person.role}</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100" data-testid="ts-worked">{fmtDuration(p.workedMinutes)} worked</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{fmtDuration(p.breakMinutes)} on breaks</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{p.days.filter((d) => d.summary.shifts.length).length} days</span>
                {bad > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">{bad} forgot to clock out</span>}
              </summary>
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr><th className="px-4 py-2">Day</th><th className="px-2 py-2">Clocked in</th><th className="px-2 py-2">Breaks</th><th className="px-2 py-2">Clocked out</th><th className="px-4 py-2 text-right">Worked</th></tr>
                  </thead>
                  <tbody>
                    {p.days.filter((d) => d.summary.shifts.length).map((d) => (
                      <tr key={d.day} className="border-t border-slate-100 dark:border-slate-800" data-testid="ts-day" data-day={d.day}>
                        <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-50">{dayLabel(d.day)}</td>
                        <td className="px-2 py-2 tabular-nums">{d.summary.shifts.map((s) => localTime(s.start, zone)).join(", ")}</td>
                        <td className="px-2 py-2 tabular-nums">{d.summary.breakCount ? `${d.summary.breakCount} · ${fmtDuration(d.summary.breakMinutes)}` : <span className="text-slate-400">-</span>}</td>
                        <td className="px-2 py-2 tabular-nums">{d.summary.shifts.map((s) => (s.forgotClockOut ? "no clock-out" : s.end ? localTime(s.end, zone) : "still working")).join(", ")}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{d.summary.forgotClockOut ? <span className="font-semibold text-red-700 dark:text-red-300">?</span> : fmtDuration(d.summary.workedMinutes)}</td>
                      </tr>
                    ))}
                    {!p.days.some((d) => d.summary.shifts.length) && (
                      <tr><td colSpan={5} className="px-4 py-3 text-slate-500">No time clock entries in this {kind}.</td></tr>
                    )}
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
