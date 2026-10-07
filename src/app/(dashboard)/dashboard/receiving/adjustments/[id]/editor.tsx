"use client";

// The adjustment quotation editor: the original quotation's lines on one side, the corrected lines to edit,
// the reason, and the totals. Finalizing attaches the PDF to the receiving order.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAdjustment, finalizeAdjustmentAction, regenerateAdjustment, saveAdjustment } from "@/app/actions/receiving-adjustments";
import type { AdjustmentView } from "@/lib/receiving-adjustment-service";
import { adjustmentDifference, adjustmentTotals, lineTotalOf } from "@/lib/receiving-adjustment";
import { ADJUSTMENT_REASON_OPTIONS } from "@/lib/receiving-rules";
import { MONEY } from "@/lib/receiving-ui";

const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800";
const th = "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400";

type Row = {
  key: string;
  id: string | null;
  productName: string;
  productCode: string;
  condition: string;
  expiryLabel: string;
  originalQuantity: number | null;
  originalUnitPrice: number | null;
  quantity: string;
  unitPrice: string;
  note: string;
};

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const money = (s: string) => {
  const n = num(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const qtyOf = (s: string) => {
  const n = num(s);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

type EditorProps = {
  adjustment: AdjustmentView;
  canWrite: boolean;
  /** Shown inside Step 7 of the intake form instead of on its own page. */
  embedded?: boolean;
  /** Embedded only: saves the intake form first (so Step 6 is up to date). Returns an error message, or null. */
  beforeAction?: () => Promise<string | null>;
  /** Embedded only: told about what happened, so the form can stay in step. */
  /** Embedded only: a message to show on first render (the editor restarts after a regenerate, which would lose one set before it). */
  initialNotice?: string;
  onChanged?: (e: { kind: "finalized" | "regenerated" | "discarded" | "saved"; adjustedTotal: number; difference: number }) => void;
};

export function AdjustmentEditor({ adjustment: a, canWrite, embedded = false, beforeAction, initialNotice = "", onChanged }: EditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  // Bumped after every save / finalize / regenerate so the inline PDF below reloads and shows the new quotation.
  const [rev, setRev] = useState(0);
  // The editing boxes start closed once a reason is set: the quotation itself is what the agent looks at.
  const [editOpen, setEditOpen] = useState(!a.reasonCategory);
  const [reason, setReason] = useState(a.reasonCategory);
  const [notes, setNotes] = useState(a.reasonNotes);
  const [bonus, setBonus] = useState(String(a.bonusAmount));
  const [deduction, setDeduction] = useState(String(a.deductionAmount));
  const [rows, setRows] = useState<Row[]>(() =>
    a.lines.map((l) => ({
      key: l.id,
      id: l.id,
      productName: l.productName,
      productCode: l.productCode,
      condition: l.condition,
      expiryLabel: l.expiryLabel,
      originalQuantity: l.originalQuantity,
      originalUnitPrice: l.originalUnitPrice,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      note: l.note,
    })),
  );
  const editable = canWrite;
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const totals = useMemo(
    () => adjustmentTotals(rows.map((r) => ({ productName: r.productName, quantity: qtyOf(r.quantity), unitPrice: money(r.unitPrice) })), money(bonus), money(deduction)),
    [rows, bonus, deduction],
  );
  const diff = adjustmentDifference(a.originalTotal, totals.adjustedTotal);

  const payload = () => ({
    reasonCategory: reason || null,
    reasonNotes: notes,
    bonusAmount: money(bonus),
    deductionAmount: money(deduction),
    lines: rows.map((r) => ({
      id: r.id,
      productName: r.productName,
      productCode: r.productCode,
      condition: r.condition,
      expiryLabel: r.expiryLabel,
      quantity: num(r.quantity),
      unitPrice: num(r.unitPrice),
      note: r.note,
    })),
  });

  function run(kind: "save" | "preview" | "finalize") {
    setError("");
    setNotice("");
    start(async () => {
      const before = await beforeAction?.();
      if (before) return setError(before);
      const r = kind === "finalize" ? await finalizeAdjustmentAction(a.id, payload()) : await saveAdjustment(a.id, payload());
      if (r.error) return setError(r.error);
      if (kind === "preview" && !embedded) window.open(`/api/receiving/adjustments/${a.id}/pdf`, "_blank", "noopener");
      setRev((n) => n + 1);
      setNotice(kind === "save" ? "Saved. The quotation above is updated." : kind === "preview" ? (embedded ? "Saved. The quotation above is updated." : "Saved. The preview opened in a new tab.") : (r.notice ?? "Finalized."));
      onChanged?.({ kind: kind === "finalize" ? "finalized" : "saved", adjustedTotal: totals.adjustedTotal, difference: diff });
      router.refresh();
    });
  }

  function regenerate() {
    if (!window.confirm("Rebuild this adjusted quotation from the original quotation and what you entered in Step 6? The lines below are replaced. The reason and note are kept.")) return;
    setError("");
    setNotice("");
    start(async () => {
      const before = await beforeAction?.();
      if (before) return setError(before);
      const r = await regenerateAdjustment(a.id);
      if (r.error) return setError(r.error);
      setRev((n) => n + 1);
      onChanged?.({ kind: "regenerated", adjustedTotal: a.adjustedTotal, difference: adjustmentDifference(a.originalTotal, a.adjustedTotal) });
      router.refresh();
    });
  }

  function discard() {
    if (!window.confirm("Discard this adjustment quotation? Its attached PDF is removed from the receiving order.")) return;
    setError("");
    start(async () => {
      const r = await deleteAdjustment(a.id);
      if (r.error) return setError(r.error);
      onChanged?.({ kind: "discarded", adjustedTotal: a.adjustedTotal, difference: 0 });
      if (embedded) router.refresh();
      else router.push(`/dashboard/receiving/intake/${a.packageId}`);
    });
  }

  return (
    <div className={embedded ? "" : "mx-auto max-w-6xl px-4 py-6"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!embedded && <Link href={`/dashboard/receiving/intake/${a.packageId}`} className="text-xs font-medium text-amber-800 underline dark:text-amber-300">← Back to the receiving order</Link>}
          {embedded ? (
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Adjustment Quotation {a.number}</h3>
          ) : (
            <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">Adjustment Quotation {a.number}</h1>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {a.customerName} · Order {a.quotationNumber}{a.trackingNumber ? ` · ${a.trackingNumber}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${a.status === "FINAL" ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100"}`}>
          {a.status === "FINAL" ? "Final — attached to the order" : "Draft"}
        </span>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">{notice}</p>}

      {embedded && (
        <section className="mt-5" aria-label="Adjustment quotation">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Adjustment quotation (what the customer receives)</h2>
            <a href={`/api/receiving/adjustments/${a.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs font-medium text-amber-800 underline dark:text-amber-300">Open in a new tab</a>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300" data-testid="adj-reason-line">
            <span className="font-semibold">Reason:</span> {a.reasonNotes.trim() || a.reasonCategory || "not set yet. Open the boxes below and choose one."}
            {" · "}
            <span className="font-semibold">Adjusted total:</span> {MONEY.format(a.adjustedTotal)}
            {" · "}
            <span className={a.adjustedTotal - a.originalTotal < 0 ? "font-medium text-red-700 dark:text-red-300" : ""}>
              {a.adjustedTotal - a.originalTotal > 0 ? "+" : ""}
              {MONEY.format(a.adjustedTotal - a.originalTotal)} from the original
            </span>
          </p>
          <iframe
            key={rev}
            title={`Adjustment Quotation ${a.number}`}
            src={`/api/receiving/adjustments/${a.id}/pdf?v=${rev}-${a.adjustedTotal}-${a.lines.length}-${a.reasonNotes.length}#toolbar=0&navpanes=0&view=FitH`}
            className="mt-2 h-[44rem] w-full max-w-3xl rounded-lg border border-slate-200 bg-white dark:border-slate-700"
          />
          <p className="mt-1 text-xs text-slate-500">This is the saved quotation. After you change anything below, press Save & update quotation to refresh it.</p>
        </section>
      )}

      <details className="mt-5" open={editOpen} onToggle={(e) => setEditOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-50">Edit the reason, lines, bonus and deduction</summary>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Reason for adjustment</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[16rem_1fr]">
          <div>
            <label htmlFor="adj-reason" className="text-xs font-medium text-slate-600 dark:text-slate-400">Reason</label>
            <select id="adj-reason" className={input} value={reason} disabled={!editable} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {ADJUSTMENT_REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="adj-notes" className="text-xs font-medium text-slate-600 dark:text-slate-400">Reason as the customer reads it (printed in the Reason box)</label>
            <textarea id="adj-notes" rows={3} maxLength={2000} placeholder="e.g. 1 damaged - Dexcom G7 sensor" className={input} value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Products</h2>
          <a href={`/api/receiving/packages/${a.packageId}/quotation-receipt`} target="_blank" rel="noreferrer" className="text-xs font-medium text-amber-800 underline dark:text-amber-300">Open the original quotation</a>
        </div>
        <p className="mt-1 text-xs text-slate-500">Each line starts from the original quotation and what was received. Change the quantity, price, or condition to what you are actually paying for.</p>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={th}>Note (condition)</th>
                <th className={th}>Expiry</th>
                <th className={th}>Originally quoted</th>
                <th className={`${th} w-24`}>Qty</th>
                <th className={`${th} w-28`}>Unit price</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Remark</th>
                <th className={th}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 align-top dark:divide-slate-800">
              {rows.map((r, i) => {
                const changed = r.originalQuantity != null && (qtyOf(r.quantity) !== r.originalQuantity || (r.originalUnitPrice != null && Math.abs(money(r.unitPrice) - r.originalUnitPrice) > 0.004));
                return (
                  <tr key={r.key} className={changed || r.originalQuantity == null ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                    <td className="px-2 py-2">
                      <input aria-label={`Product, line ${i + 1}`} className={`${input} min-w-[15rem]`} value={r.productName} disabled={!editable} maxLength={160} onChange={(e) => patch(r.key, { productName: e.target.value })} />
                      {r.productCode && <p className="mt-0.5 text-xs text-slate-500">{r.productCode}</p>}
                    </td>
                    <td className="px-2 py-2"><input aria-label={`Condition, line ${i + 1}`} className={input} value={r.condition} disabled={!editable} maxLength={80} placeholder="Mint, Damaged…" onChange={(e) => patch(r.key, { condition: e.target.value })} /></td>
                    <td className="px-2 py-2"><input aria-label={`Expiry, line ${i + 1}`} className={`${input} min-w-[7rem]`} value={r.expiryLabel} disabled={!editable} maxLength={80} placeholder="MM/DD/YYYY" onChange={(e) => patch(r.key, { expiryLabel: e.target.value })} /></td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {r.originalQuantity != null ? `${r.originalQuantity} × ${MONEY.format(r.originalUnitPrice ?? 0)}` : "Not on the quotation"}
                    </td>
                    <td className="px-2 py-2"><input aria-label={`Quantity, line ${i + 1}`} inputMode="numeric" className={input} value={r.quantity} disabled={!editable} onChange={(e) => patch(r.key, { quantity: e.target.value })} /></td>
                    <td className="px-2 py-2"><input aria-label={`Unit price, line ${i + 1}`} inputMode="decimal" className={input} value={r.unitPrice} disabled={!editable} onChange={(e) => patch(r.key, { unitPrice: e.target.value })} /></td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums">{MONEY.format(lineTotalOf(qtyOf(r.quantity), money(r.unitPrice)))}</td>
                    <td className="px-2 py-2"><input aria-label={`Note, line ${i + 1}`} className={input} value={r.note} disabled={!editable} maxLength={300} placeholder="e.g. 2 boxes damaged" onChange={(e) => patch(r.key, { note: e.target.value })} /></td>
                    <td className="px-2 py-2">
                      {editable && <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950" aria-label={`Remove line ${i + 1}`}>Remove</button>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={9} className="px-2 py-6 text-center text-sm text-slate-500">No lines. Add one below.</td></tr>}
            </tbody>
          </table>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: `new-${Date.now()}-${rs.length}`, id: null, productName: "", productCode: "", condition: "", expiryLabel: "", originalQuantity: null, originalUnitPrice: null, quantity: "1", unitPrice: "0", note: "" }])}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            + Add a line
          </button>
        )}
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Bonus and deduction</h2>
          <p className="mt-1 text-xs text-slate-500">Carried over from the original quotation. Change them if the adjustment changes them.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="adj-bonus" className="text-xs font-medium text-slate-600 dark:text-slate-400">Bonus ($)</label>
              <input id="adj-bonus" inputMode="decimal" className={input} value={bonus} disabled={!editable} onChange={(e) => setBonus(e.target.value)} />
            </div>
            <div>
              <label htmlFor="adj-deduction" className="text-xs font-medium text-slate-600 dark:text-slate-400">Deduction ($)</label>
              <input id="adj-deduction" inputMode="decimal" className={input} value={deduction} disabled={!editable} onChange={(e) => setDeduction(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Totals</h2>
          <dl className="mt-3 space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-slate-600 dark:text-slate-400">Original quotation total</dt><dd>{MONEY.format(a.originalTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600 dark:text-slate-400">Adjusted items</dt><dd>{MONEY.format(totals.itemsTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600 dark:text-slate-400">Bonus</dt><dd>+{MONEY.format(money(bonus))}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600 dark:text-slate-400">Deduction</dt><dd>−{MONEY.format(money(deduction))}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold dark:border-slate-700"><dt>Adjusted total</dt><dd>{MONEY.format(totals.adjustedTotal)}</dd></div>
            <div className={`flex justify-between text-sm font-medium ${diff < 0 ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-slate-300"}`}><dt>Change from the original</dt><dd>{diff > 0 ? "+" : ""}{MONEY.format(diff)}</dd></div>
          </dl>
        </div>
      </section>

      </details>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {editable ? (
          <>
            <button type="button" disabled={pending} onClick={() => run("finalize")} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-60">
              {pending ? "Working…" : a.status === "FINAL" ? "Finalize again & re-attach" : "Finalize & attach to the order"}
            </button>
            <button type="button" disabled={pending} onClick={() => run("save")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">Save adjustment draft</button>
            <button type="button" disabled={pending} onClick={() => run("preview")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">{embedded ? "Save & update quotation" : "Save & preview PDF"}</button>
            <button type="button" disabled={pending} onClick={regenerate} title="Start over from the original quotation and what you entered in Step 6" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">Regenerate from received items</button>
            <button type="button" disabled={pending} onClick={discard} className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950">Discard</button>
          </>
        ) : (
          <a href={`/api/receiving/adjustments/${a.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Open PDF</a>
        )}
      </div>
      {editable && <p className="mt-2 text-xs text-slate-500">Finalizing attaches the PDF to the receiving order. After the shipment is marked Paid, the customer email includes it.</p>}
    </div>
  );
}
