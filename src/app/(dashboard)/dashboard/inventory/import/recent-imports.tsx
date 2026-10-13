"use client";

import { useState, useTransition } from "react";
import { undoStockImportAction } from "@/app/actions/inventory-import";

type Imp = { refId: string; fileName: string; at: string; by: string | null; lines: number; units: number; remaining: number; undone: boolean };

const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export function RecentImports({ imports }: { imports: Imp[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  if (!imports.length) return null;
  const undo = (refId: string) =>
    start(async () => {
      const res = await undoStockImportAction(refId);
      setAsking(null);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Undone." } : { ok: false, text: res.error ?? "Couldn't undo it." });
    });
  return (
    <section className="mt-8" data-testid="ii-recent">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Recent imports</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">An undo takes the stock back out with reversing entries. Nothing is deleted, and Stock History keeps both. It isn&apos;t possible once some of that stock has been sold.</p>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "ii-undo-message" : "ii-undo-error"}>{msg.text}</p>}
      <ul className={`${card} mt-3 divide-y divide-slate-200 dark:divide-slate-800`}>
        {imports.map((i) => (
          <li key={i.refId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" data-testid={`ii-import-${i.refId}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{i.fileName || "Imported file"}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {new Date(i.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                {i.by ? ` by ${i.by}` : ""} &middot; {i.lines} {i.lines === 1 ? "line" : "lines"}, {i.units.toLocaleString("en-US")} {i.units === 1 ? "unit" : "units"}
              </p>
            </div>
            {i.undone ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300" data-testid={`ii-undone-${i.refId}`}>Undone</span>
            ) : asking === i.refId ? (
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-700 dark:text-slate-300">Take these {i.remaining.toLocaleString("en-US")} units back out of stock?</span>
                <button type="button" disabled={pending} onClick={() => undo(i.refId)} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60" data-testid={`ii-undo-confirm-${i.refId}`}>{pending ? "Undoing..." : "Yes, undo it"}</button>
                <button type="button" onClick={() => setAsking(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700">Keep it</button>
              </span>
            ) : (
              <button type="button" onClick={() => setAsking(i.refId)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" data-testid={`ii-undo-${i.refId}`}>Undo this import</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
