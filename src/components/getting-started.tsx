import Link from "next/link";
import { SIDE_INFO, SIDES, progressSummary, type Sides, type StepProgress } from "@/lib/operations-rules";

/**
 * "Getting started" on Home for owners and admins: for each side the company runs, the first few steps with a tick for those already
 * done. One closed line when most is done, open while the company is just starting. It disappears when every step is done.
 */
export function GettingStarted({ sides, done }: { sides: Sides; done: StepProgress }) {
  const { done: d, total } = progressSummary(sides, done);
  if (total > 0 && d === total) return null;
  const on = SIDES.filter((s) => sides[s]);
  return (
    <details open={d === 0} className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="getting-started">
      <summary className="cursor-pointer font-semibold text-slate-900 dark:text-slate-50">
        Getting started: {on.map((s) => SIDE_INFO[s].title).join(" and ")} <span className="font-normal text-slate-600 dark:text-slate-300" data-testid="getting-started-count">({d} of {total} done)</span>
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {on.map((s) => (
          <div key={s} data-testid={`steps-${s}`}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{SIDE_INFO[s].title}</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {SIDE_INFO[s].firstSteps.map((st) => {
                const known = st.id in done;
                const ticked = known && done[st.id];
                return (
                  <li key={st.id} className="flex items-start gap-2" data-step={st.id} data-done={ticked ? "yes" : "no"}>
                    <span aria-hidden className={ticked ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400"}>{ticked ? "✓" : "○"}</span>
                    <Link href={st.href} className={ticked ? "text-slate-600 line-through dark:text-slate-400" : "text-emerald-800 underline dark:text-emerald-300"}>{st.text}</Link>
                    {ticked && <span className="sr-only"> (done)</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-slate-600 dark:text-slate-300">
        Want it explained from start to finish? Open <Link href="/dashboard/settings/operations" className="underline">Settings → Operations</Link>, or ask Jin.
      </p>
    </details>
  );
}
