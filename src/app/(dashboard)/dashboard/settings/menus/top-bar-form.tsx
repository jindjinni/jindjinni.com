"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetTopBar, saveTopBar } from "@/app/actions/sidebar-menu";
import { MAX_LABEL } from "@/lib/sidebar-menu";

type Row = { id: string; label: string; defaultLabel: string; locked: boolean; hidden: boolean };

export function TopBarForm({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [list, setList] = useState<Row[]>(rows);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Home stays first and Settings last, so only the rows between them can move.
  const movable = (i: number) => !list[i].locked;
  const move = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to < 0 || to >= list.length || !movable(i) || !movable(to)) return;
    const next = [...list];
    [next[i], next[to]] = [next[to], next[i]];
    setList(next);
  };
  const patch = (i: number, p: Partial<Row>) => setList(list.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveTopBar({ items: list.map((r) => ({ id: r.id, label: r.label, hidden: r.hidden })) });
      if (res.ok) { setMsg({ ok: true, text: "Saved. The top bar now looks like this for everyone in your company." }); router.refresh(); }
      else setMsg({ ok: false, text: res.error });
    });
  const reset = () =>
    start(async () => {
      setMsg(null);
      const res = await resetTopBar();
      if (res.ok) { setMsg({ ok: true, text: "The original top bar is back." }); router.refresh(); }
      else setMsg({ ok: false, text: res.error });
    });

  const btn = "rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800";
  return (
    <div className="mt-6 max-w-xl">
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" data-testid="top-rows">
        {list.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2 px-3 py-2" data-testid="top-row" data-id={r.id}>
            <span className="flex gap-1">
              <button type="button" className={btn} disabled={!movable(i) || !movable(i - 1)} onClick={() => move(i, -1)} aria-label={`Move ${r.defaultLabel} earlier`}>▲</button>
              <button type="button" className={btn} disabled={!movable(i) || !movable(i + 1)} onClick={() => move(i, 1)} aria-label={`Move ${r.defaultLabel} later`}>▼</button>
            </span>
            <input
              id={`top-label-${r.id}`}
              value={r.label}
              maxLength={MAX_LABEL}
              disabled={r.locked || r.id === "chat"}
              placeholder={r.defaultLabel}
              onChange={(e) => patch(i, { label: e.target.value })}
              aria-label={`Name of the ${r.defaultLabel} link`}
              className={`min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 ${r.hidden ? "opacity-50" : ""}`}
            />
            {r.locked ? (
              <span className="w-16 text-center text-xs text-slate-400">always shown</span>
            ) : (
              <label className="flex w-16 items-center justify-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={!r.hidden} onChange={(e) => patch(i, { hidden: !e.target.checked })} data-testid="top-show" aria-label={`Show ${r.defaultLabel} in the top bar`} />
                show
              </label>
            )}
          </li>
        ))}
      </ul>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"}`} data-testid="top-msg">{msg.text}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" data-testid="top-save">{pending ? "Saving…" : "Save top bar"}</button>
        <button type="button" onClick={reset} disabled={pending} className="rounded-md px-3 py-2 text-sm text-slate-600 underline dark:text-slate-300" data-testid="top-reset">Put the original bar back</button>
      </div>
    </div>
  );
}
