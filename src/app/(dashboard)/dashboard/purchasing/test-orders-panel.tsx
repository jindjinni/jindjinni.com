"use client";

import { useState } from "react";
import { loadTestOrdersChunk, removeTestOrders, startTestOrders, type TestOrdersState } from "@/app/actions/test-orders";
import type { TestOrderResult } from "@/lib/test-orders-run";

const TOTAL = 100;
const CHUNK = 3;

export function TestOrdersPanel({ existing }: { existing: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<TestOrderResult[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setResults([]);
    setDone(0);
    try {
      const s: TestOrdersState = await startTestOrders();
      if (s.error) throw new Error(s.error);
      setNotes([
        ...(s.prepare?.notes ?? []),
        `Test prices added to ${s.prepare?.pricedProducts ?? 0} unpriced product(s); ${s.prepare?.recallNumbersAdded ?? 0} public recall numbers loaded.`,
      ]);
      for (let from = 1; from <= TOTAL; from += CHUNK) {
        const out = await loadTestOrdersChunk(from, CHUNK);
        if (out.error) throw new Error(out.error);
        setResults((r) => [...r, ...(out.results ?? [])]);
        setDone(out.loaded ?? from + CHUNK - 1);
      }
      setMessage("All 100 test orders are loaded. Open Quotations in Purchasing, and the All Shipments board in Receiving.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove every TEST order and TEST customer from this company? Nothing else is touched.")) return;
    setBusy(true);
    setError(null);
    try {
      const out = await removeTestOrders();
      setMessage(`Removed ${out.removed?.orders ?? 0} test orders and ${out.removed?.customers ?? 0} test customers.`);
      setResults([]);
      setDone(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const problems = results.flatMap((r) => r.problems.map((p) => `#${r.index} ${r.quotationNumber ?? ""}: ${p}`));

  return (
    <section className="mt-6 max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30">
      <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Platform owner: test orders</h2>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        Creates 100 different orders through the real Purchasing and Receiving screens: every customer is named &ldquo;TEST &hellip;&rdquo;, tracking numbers are made up, and they run through quoting, recall checks, receiving, adjustments and Accounts. Best used in a test company.
        {existing > 0 ? ` ${existing} test customer(s) are already here; loading again skips them.` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={load} disabled={busy} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60">
          {busy ? `Loading… ${done} of ${TOTAL}` : "Load 100 test orders"}
        </button>
        <button type="button" onClick={remove} disabled={busy} className="rounded-md border border-amber-600 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60 dark:text-amber-200 dark:hover:bg-amber-900/30">
          Remove test orders
        </button>
      </div>
      {busy && done > 0 && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded bg-amber-200 dark:bg-amber-900/50" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={TOTAL}>
          <div className="h-full bg-amber-600" style={{ width: `${Math.min(100, (done / TOTAL) * 100)}%` }} />
        </div>
      )}
      {notes.map((n) => (
        <p key={n} className="mt-2 text-xs text-amber-800 dark:text-amber-300">{n}</p>
      ))}
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-emerald-800 dark:text-emerald-400">{message}</p>}
      {results.length > 0 && (
        <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">
          {results.length} loaded, {problems.length === 0 ? "no problems found." : `${problems.length} problem(s) found:`}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-red-800 dark:text-red-300">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
