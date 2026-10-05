"use client";

// Step 7: the adjustment quotation, built right here. No quotation yet -> a button that starts one from the original
// quotation and what was entered in Step 6. Once started, the editor is shown inline (reason, lines, totals, PDF).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAdjustment } from "@/app/actions/receiving-adjustments";
import { AdjustmentEditor } from "../../adjustments/[id]/editor";
import type { AdjustmentView } from "@/lib/receiving-adjustment-service";

export type AdjustmentChange = { kind: "finalized" | "regenerated" | "discarded" | "saved"; adjustedTotal: number; difference: number };

export function AdjustmentSection({
  packageId,
  view,
  canWrite,
  beforeAction,
  onChanged,
}: {
  packageId: string;
  view: AdjustmentView | null;
  canWrite: boolean;
  beforeAction: () => Promise<string | null>;
  onChanged: (e: AdjustmentChange) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  // After "Regenerate" the editor has to start over from the rebuilt lines. They only arrive once the page has refreshed,
  // which is when the line ids change -- so that is the moment to remount the editor.
  const [editorKey, setEditorKey] = useState(0);
  const regenerating = useRef(false);
  const lineSig = view ? view.lines.map((l) => l.id).join(",") : "";
  useEffect(() => {
    if (regenerating.current) {
      regenerating.current = false;
      setEditorKey((k) => k + 1);
    }
  }, [lineSig]);
  const changed = (e: AdjustmentChange) => {
    if (e.kind === "regenerated") regenerating.current = true;
    onChanged(e);
  };

  if (view) {
    return (
      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-950/20" id="adjustment-quotation">
        <AdjustmentEditor key={`${view.id}:${editorKey}`} adjustment={view} canWrite={canWrite} embedded beforeAction={beforeAction} onChanged={changed} />
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" id="adjustment-quotation">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Adjustment Quotation</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Damaged, short or different supplies? Create an adjustment quotation for the customer. It starts from the original quotation and what you entered in Step 6, and you correct the quantities, prices, conditions and reason.
      </p>
      {canWrite ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError("");
                const before = await beforeAction();
                if (before) return setError(before);
                const r = await startAdjustment(packageId);
                if (r.error || !r.id) return setError(r.error ?? "Couldn't start the adjustment quotation.");
                router.refresh();
              })
            }
            className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create adjustment quotation"}
          </button>
          {error && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Receivers, accountants and admins can create one.</p>
      )}
    </div>
  );
}
