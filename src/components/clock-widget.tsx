"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { pressClockAction } from "@/app/actions/hr";
import { fmtDuration, localTime, type ClockKind, type ClockState } from "@/lib/hr-rules";

type Props = { state: ClockState; buttons: { kind: ClockKind; label: string }[]; since: string | null; workedMinutes: number; breakMinutes: number; zone: string; nowIso: string };

const DOT: Record<ClockState, string> = { OUT: "bg-slate-400", WORKING: "bg-green-500", BREAK: "bg-yellow-500" };
const WORDS: Record<ClockState, string> = { OUT: "Not clocked in", WORKING: "Working", BREAK: "On break" };

/** The time clock at the top of every screen: clock in, start and end a break, clock out. Every press is time-stamped by the server. */
export function ClockWidget(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.parse(p.nowIso));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const press = (kind: ClockKind) => {
    setError(null);
    start(async () => {
      const r = await pressClockAction(kind);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  };
  // The server's totals were right at page load; add the minutes that have passed since while the clock runs.
  const extra = p.state === "OUT" ? 0 : Math.max(0, Math.round((now - Date.parse(p.nowIso)) / 60000));
  const worked = p.workedMinutes + (p.state === "WORKING" ? extra : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="clock">
      <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200" data-testid="clock-state" data-state={p.state}>
        <span className={`h-2 w-2 rounded-full ${DOT[p.state]}`} aria-hidden="true" />
        {WORDS[p.state]}
        {p.since && <span className="font-normal text-slate-500 dark:text-slate-400">since {localTime(p.since, p.zone)}</span>}
        {p.state !== "OUT" && <span className="font-normal text-slate-500 dark:text-slate-400" data-testid="clock-worked">· {fmtDuration(worked)} worked</span>}
      </span>
      {p.buttons.map((b) => (
        <button
          key={b.kind}
          type="button"
          disabled={pending}
          onClick={() => press(b.kind)}
          className={`rounded-md border px-2.5 py-1 font-medium disabled:opacity-60 ${
            b.kind === "CLOCK_IN" ? "border-green-600 bg-green-600 text-white hover:bg-green-700" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          }`}
          data-testid={`clock-${b.kind.toLowerCase().replace("_", "-")}`}
        >
          {b.label}
        </button>
      ))}
      {error && <span className="text-red-700 dark:text-red-300" role="alert" data-testid="clock-error">{error}</span>}
    </div>
  );
}
