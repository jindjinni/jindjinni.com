"use client";

// The simpler Recall check (flag `recall-simple`): pick the product, type or scan its number, press Check, read ONE answer,
// then (when the product has a recall) open the manufacturer's own page and say what it showed. Everything else (other
// recalls, the checks already made, the admin lists) is closed until opened. Same rules and actions as the full screen.

import { useState, useTransition } from "react";
import { removeRecallCheck } from "@/app/actions/receiving-recalls";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import { RECALL_RESULT_LABELS, isClearingCheck, isHitCleared, isRecalledResult, normalizeNumber, recallsForProduct } from "@/lib/receiving-recall";
import { rowCheckStatus, type RowStatus } from "@/lib/receiving-recall-status";
import type { ItemState } from "./item-card";
import { field } from "./intake-parts";
import { ManageRecalls } from "./recall-check";
import { ScanTools } from "./scan-tools";
import { useRecallRunner } from "./use-recall-runner";

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const btnPrimary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";
const linkBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-950 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-50 dark:hover:bg-sky-900/50";

const tone = {
  bad: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  warn: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-50",
  ok: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  muted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
} as const;
const resultTone = {
  bad: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
  ok: "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-50",
  info: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50",
} as const;

export function RecallCheckSimple({
  packageId,
  items,
  editable,
  isAdminUser,
  photoReading,
  recalls,
  onRecalls,
  checks,
  onChecks,
  onPatchMany,
  onError,
  focus,
  onBack,
}: {
  focus?: { rowId: string; n: number } | null;
  onBack?: () => void;
  packageId: string;
  items: ItemState[];
  editable: boolean;
  isAdminUser: boolean;
  photoReading: boolean;
  recalls: RecallView[];
  onRecalls: (r: RecallView[]) => void;
  checks: RecallCheckView[];
  onChecks: (checks: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
}) {
  const rows = items.filter((i) => i.productName.trim());
  const [rowId, setRowId] = useState("");
  const [input, setInput] = useState("");
  const [removing, startRemove] = useTransition();
  const runner = useRecallRunner({ packageId, recalls, onChecks, onPatchMany, onError });
  const { outcome, setOutcome, note: scanMsg, pending } = runner;

  // When the form switches the checker on for a row, select that row (adjusting state while rendering).
  const [seenFocus, setSeenFocus] = useState(focus?.n ?? 0);
  if (focus && focus.n !== seenFocus) {
    setSeenFocus(focus.n);
    setRowId(focus.rowId);
    setOutcome(null);
  }

  const active = recalls.filter((r) => r.active);
  const row = rows.find((r) => r.id === rowId) ?? rows[0];
  const rowChecks = checks.filter((c) => c.itemId === row?.id);
  const mine = row ? recallsForProduct(row.productName, active) : [];
  const others = active.filter((r) => !mine.some((m) => m.id === r.id));
  const statusOf = (r: ItemState): RowStatus =>
    rowCheckStatus(recallsForProduct(r.productName, active), checks.filter((c) => c.itemId === r.id));
  const number = normalizeNumber(input);

  function applyScanned(text: string) {
    if (row) setInput(runner.applyScanned(row, text));
  }
  function removeCheck(id: string) {
    startRemove(async () => {
      const r = await removeRecallCheck(packageId, id);
      if (r.error) return onError(r.error);
      if (r.checks) onChecks(r.checks);
      const p = r.itemPatch;
      const itemId = checks.find((c) => c.id === id)?.itemId;
      if (p && itemId) {
        const upd: Partial<ItemState> = {};
        if (p.needsReturn !== undefined) upd.needsReturn = p.needsReturn as ItemState["needsReturn"];
        if (p.returnStatus !== undefined) upd.returnStatus = p.returnStatus as ItemState["returnStatus"];
        if (p.quantityToReturn !== undefined) upd.quantityToReturn = p.quantityToReturn;
        if (p.returnNotes !== undefined) upd.returnNotes = p.returnNotes;
        onPatchMany({ [itemId]: upd });
      }
    });
  }

  return (
    <div className="mt-8" id="recall-check" data-recall-simple>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Recall check</h3>
        {onBack && (
          <button type="button" onClick={onBack} className={`${btn} py-1.5`}>
            &larr; Back to items received
          </button>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Check each product&apos;s lot or serial number. A product found on a recall is marked for return.</p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Add a received product above, then check its lot or serial number here.</p>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Pick the product</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Products received">
            {rows.map((r, i) => {
              const st = statusOf(r);
              const on = r.id === row?.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  data-product-chip
                  onClick={() => {
                    setRowId(r.id);
                    setOutcome(null);
                  }}
                  className={`flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${on ? "border-sky-500 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/30" : "border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"}`}
                >
                  <span className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-50">{i + 1}. {r.productName}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone[st.tone]}`}>{st.label}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <label htmlFor="recall-number">2. Lot or serial number</label>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="recall-number"
              className={`${field} min-w-[12rem] flex-1 font-mono uppercase`}
              value={input}
              placeholder={row?.lotNumber ? `e.g. ${row.lotNumber}` : "Type, use a barcode scanner, or take a photo"}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={!editable}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (editable && !pending) applyScanned(input);
                }
              }}
            />
            <button type="button" className={btnPrimary} disabled={!editable || pending || !input.trim()} onClick={() => applyScanned(input)}>
              {pending ? "Checking…" : "Check"}
            </button>
          </div>
          {row?.lotNumber && !input && editable && (
            <button type="button" className="mt-1.5 text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950 dark:text-sky-300" onClick={() => setInput(row.lotNumber)}>
              Use this row&apos;s lot number ({row.lotNumber})
            </button>
          )}
          <div className="mt-3">
            <ScanTools idPrefix="recall" disabled={!editable || !row} photoReading={photoReading} onText={applyScanned} onError={onError} />
          </div>
          {scanMsg && <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">{scanMsg}</p>}

          {outcome && (
            <div role="status" className={`mt-4 rounded-lg border px-4 py-3 text-sm ${resultTone[outcome.tone]}`}>
              <p className="text-base font-bold">{outcome.title}</p>
              {outcome.lines.map((l) => (
                <p key={l} className="mt-1">{l}</p>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">3. Make sure on the manufacturer&apos;s page</p>
            {mine.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No recall is set up for this product, so there is nothing more to look up.</p>
            ) : (
              <div className="mt-2 space-y-4">
                {mine.map((r) => {
                  const loaded = r.numberCount + r.prefixCount;
                  return (
                    <div key={r.id} data-recall-card>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {r.name}
                        {r.manufacturer && <span className="font-normal text-slate-500"> · {r.manufacturer}</span>}
                      </p>
                      {r.numberHint && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{r.numberHint}</p>}
                      <p className="mt-0.5 text-xs text-slate-500">
                        {loaded > 0 ? `Our list has ${loaded.toLocaleString()} numbers${r.listUpdatedAt ? ` (updated ${r.listUpdatedAt})` : ""}, but only their page is final.` : "No list is loaded here, so their page is the only way to check."}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {r.lookupUrl && (
                          <a className={linkBtn} href={r.lookupUrl} target="_blank" rel="noopener noreferrer">
                            {r.lookupLabel || "Open the manufacturer's lookup"} <span aria-hidden>↗</span>
                          </a>
                        )}
                        {r.noticeUrl && (
                          <a className="text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950 dark:text-sky-300" href={r.noticeUrl} target="_blank" rel="noopener noreferrer">
                            Read the recall notice ↗
                          </a>
                        )}
                      </div>
                      {editable && (
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {number.length >= 4 ? <>What did their page say for <span className="font-mono">{number}</span>?</> : "Type the number above, then say what their page showed."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={pending || number.length < 4 || !row} onClick={() => row && runner.confirm(row, r.id, input, true)}>
                              Affected
                            </button>
                            <button type="button" className={btn} disabled={pending || number.length < 4 || !row} onClick={() => row && runner.confirm(row, r.id, input, false)}>
                              Not affected
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {others.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-sky-800 dark:text-sky-300">Other recalls ({others.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {others.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-slate-700 dark:text-slate-200">{r.name}</span>
                    {r.lookupUrl && (
                      <a className="text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 dark:text-sky-300" href={r.lookupUrl} target="_blank" rel="noopener noreferrer">
                        {r.lookupLabel || "Open lookup"} ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rowChecks.length > 0 && (
            <details className="mt-4 text-sm" data-checks-made>
              <summary className="cursor-pointer font-medium text-sky-800 dark:text-sky-300">Checks made on this product ({rowChecks.length})</summary>
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800" aria-label="Checks made on this product">
                {rowChecks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="font-mono text-xs">{c.enteredNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isRecalledResult(c.result) && !isHitCleared(c, rowChecks) ? tone.bad : c.note.startsWith("NEAR:") ? tone.warn : tone.muted}`}>
                      {c.note.startsWith("NEAR:") ? "Looks like a recalled number" : isClearingCheck(c) ? "Not affected (cleared by an Owner or Admin)" : isHitCleared(c, rowChecks) ? "Was on the list: cleared, not affected" : RECALL_RESULT_LABELS[c.result]}
                    </span>
                    {c.recallName && <span className="text-xs text-slate-500">{c.recallName}</span>}
                    {editable && (
                      <button type="button" aria-label={`Remove check ${c.enteredNumber}`} className="ml-auto rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-red-700 dark:hover:bg-slate-800" disabled={removing} onClick={() => removeCheck(c.id)}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {active.length === 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          No recalls are set up yet. {isAdminUser ? "Use Manage recalls below to add the starting recalls." : "Ask an admin to set them up."}
        </p>
      )}
      {isAdminUser && <ManageRecalls recalls={recalls} onRecalls={onRecalls} onError={onError} />}
    </div>
  );
}
