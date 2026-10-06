"use client";

// A quick recall check for Purchasing. Type the lot or serial number a customer sent, see if it is on a recall list,
// and open the manufacturer's own lookup page. Nothing is saved.

import { useState, useTransition } from "react";
import { quickRecallLookup } from "@/app/actions/purchasing-recalls";
import type { RecallView } from "@/lib/receiving-recall-service";
import { recallsForProduct } from "@/lib/receiving-recall";
import { needsRecallChecker } from "@/lib/recall-watch";

type Outcome = { tone: "bad" | "info"; title: string; lines: string[] };

const tone = {
  bad: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
  info: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50",
} as const;

export function QuickRecallCheck({
  recalls,
  productName,
  canCheck = true,
  defaultOpen = false,
  idPrefix = "qrc",
}: {
  /** The recalls set up for this company (active ones are shown). */
  recalls: RecallView[];
  /** When a product is picked, its recall (if any) is highlighted and its lookup page comes first. */
  productName?: string;
  canCheck?: boolean;
  defaultOpen?: boolean;
  idPrefix?: string;
}) {
  const active = recalls.filter((r) => r.active);
  const mine = productName ? recallsForProduct(productName, active) : [];
  const ordered = [...mine, ...active.filter((r) => !mine.some((m) => m.id === r.id))];
  // Switched on as soon as a product that needs it is chosen (the form re-creates this panel when the product changes).
  const activated = needsRecallChecker(productName, active);
  const [open, setOpen] = useState(defaultOpen || activated);
  const [input, setInput] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function check() {
    setError("");
    setOutcome(null);
    start(async () => {
      const r = await quickRecallLookup(input);
      if (r.error || !r.results) return setError(r.error ?? "Couldn't check that number.");
      const hits = r.results.filter((x) => x.recalls.length > 0);
      if (hits.length > 0) {
        setOutcome({
          tone: "bad",
          title: "RECALLED: we can't accept this product",
          lines: [...hits.map((h) => `${h.number} is on the recall list for ${h.recalls.join(", ")}.`), "Let the customer know we can't take it. Don't give a quotation for it."],
        });
      } else {
        const date = mine
          .map((m) => m.listUpdatedAt)
          .filter(Boolean)
          .sort()
          .pop();
        const loaded = active.some((a) => a.numberCount + a.prefixCount > 0);
        setOutcome({
          tone: "info",
          title: "Not on the recall lists we have",
          lines: [
            `${r.results.map((x) => x.number).join(", ")} was not found${date ? ` (list last updated ${date})` : !loaded ? " (no lists are loaded yet)" : ""}.`,
            "That does not mean it is safe to accept. Check the number on the manufacturer's page below before you quote.",
          ],
        });
      }
    });
  }

  return (
    <div className={`rounded-xl border ${activated ? "border-sky-400 bg-sky-50/50 dark:border-sky-700 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-700"}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50/70 dark:text-slate-50 dark:hover:bg-slate-800/40"
      >
        <span>
          Recall check
          {mine.length > 0 && <span className="ml-2 rounded bg-sky-600 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-white">Recall in progress for this product</span>}
        </span>
        <span aria-hidden className="text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Some products (Omnipod 5 Pods, FreeStyle Libre 3 sensors, Dexcom G7 receivers) are under recall, and we don&apos;t accept recalled products. Enter the lot or serial number from the customer&apos;s photos to check before giving a quotation.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label htmlFor={`${idPrefix}-number`} className="sr-only">Lot or serial number</label>
            <input
              id={`${idPrefix}-number`}
              className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-900"
              value={input}
              placeholder="Lot or serial number"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={!canCheck}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canCheck && !pending && input.trim()) check();
                }
              }}
            />
            <button
              type="button"
              disabled={!canCheck || pending || !input.trim()}
              onClick={check}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {pending ? "Checking…" : "Check"}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
          {outcome && (
            <div role="status" className={`mt-3 rounded-lg border px-4 py-3 text-sm ${tone[outcome.tone]}`}>
              <p className="text-base font-bold">{outcome.title}</p>
              {outcome.lines.map((l) => (
                <p key={l} className="mt-1">{l}</p>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Check on the manufacturer&apos;s page</p>
          {ordered.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">No recalls are set up yet. An admin can add them in Receiving, Step 6, under Manage recalls.</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {ordered.map((r) => (
                <li key={r.id} className={`rounded-lg border p-3 text-sm ${mine.some((m) => m.id === r.id) ? "border-sky-400 dark:border-sky-700" : "border-slate-200 dark:border-slate-700"}`}>
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{r.name}</p>
                  {r.numberHint && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{r.numberHint}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {r.lookupUrl && (
                      <a href={r.lookupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
                        {r.lookupLabel || "Open lookup"} <span aria-hidden>↗</span>
                      </a>
                    )}
                    {r.noticeUrl && (
                      <a href={r.noticeUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 dark:text-sky-300">
                        Recall notice ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
