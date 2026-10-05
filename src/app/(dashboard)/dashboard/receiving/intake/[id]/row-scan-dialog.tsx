"use client";

// The scan button on a product row opens this: scan the barcode (camera, photo or a handheld scanner), and the row's
// lot number and expiry are filled in and the recall check runs, without leaving the table.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateUS } from "@/lib/receiving-rules";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import type { ItemState } from "./item-card";
import { field } from "./intake-parts";
import { ScanTools, scanBtn } from "./scan-tools";
import { useRecallRunner } from "./use-recall-runner";

const tone = {
  bad: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
  ok: "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-50",
  info: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50",
} as const;

export function RowScanDialog({
  packageId,
  item,
  recalls,
  photoReading,
  onClose,
  onChecks,
  onPatchMany,
  onError,
}: {
  packageId: string;
  /** The row being scanned (its current values, so the dialog shows what the scan filled in). */
  item: ItemState;
  recalls: RecallView[];
  photoReading: boolean;
  onClose: () => void;
  onChecks: (checks: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [round, setRound] = useState(0);
  const runner = useRecallRunner({ packageId, recalls, onChecks, onPatchMany, onError });
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const closeFn = useRef(onClose);
  useEffect(() => {
    closeFn.current = onClose;
  });
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFn.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  function got(text: string) {
    setTyped(runner.applyScanned(item, text, { overwriteLot: true }));
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="row-scan-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="row-scan-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">Scan {item.productName}</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Lot on this row: <span className="font-mono font-semibold">{item.lotNumber || "none yet"}</span>
              {item.expirationDate ? <> · Expires <span className="font-semibold">{formatDateUS(item.expirationDate)}</span></> : null}
            </p>
          </div>
          <button ref={closeRef} type="button" aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}>
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="row-scan-number" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barcode scanner or typed number</label>
          <input
            ref={inputRef}
            id="row-scan-number"
            className={`${field} mt-1 font-mono uppercase`}
            value={typed}
            placeholder="Click here, then scan with your scanner"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (typed.trim() && !runner.pending) got(typed);
              }
            }}
          />
        </div>

        <div className="mt-3" key={round}>
          <ScanTools idPrefix={`row-${item.id}`} photoReading={photoReading} onText={got} onError={onError} />
        </div>

        {runner.pending && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">Checking…</p>}
        {runner.note && <p role="status" className="mt-3 text-sm text-slate-700 dark:text-slate-200">{runner.note}</p>}
        {runner.outcome && (
          <div role="status" className={`mt-3 rounded-lg border px-4 py-3 text-sm ${tone[runner.outcome.tone]}`}>
            <p className="text-base font-bold">{runner.outcome.title}</p>
            {runner.outcome.lines.map((l) => (
              <p key={l} className="mt-1">{l}</p>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {runner.outcome && (
            <button
              type="button"
              className={scanBtn}
              onClick={() => {
                setTyped("");
                runner.setOutcome(null);
                runner.setNote("");
                setRound((r) => r + 1);
                inputRef.current?.focus();
              }}
            >
              Scan again
            </button>
          )}
          <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
