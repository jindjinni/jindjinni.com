"use client";

// Step 6 (Verify What Arrived) product cards and the matching Step 7 adjustment
// cards. The form owns the state; these just render one product line.

import type { ItemView, PackagePhoto } from "@/lib/receiving-queries";
import {
  ADJUSTMENT_REASON_OPTIONS,
  CONDITION_OPTIONS,
  DISCREPANCY_OPTIONS,
  RETURN_STATUS_LABELS,
  lotsMismatch,
  type ItemFacts,
} from "@/lib/receiving-rules";
import { Choice, PhotoSlot, YN, YN_RISK, YN_NA, field, type ChoiceOption } from "./intake-parts";

export type LotState = { label: string; lotNumber: string; expirationDate: string; expirationEndDate: string; quantity: string };
export type ItemState = {
  id: string;
  quotedItemId: string | null;
  productName: string;
  itemSource: "QUOTED" | "EXTRA";
  quotedQuantity: number | null;
  quotedAmount: number | null;
  wasReceived: string;
  quantityReceived: string;
  condition: string;
  needsReturn: string;
  notes: string;
  ndc: string;
  lotNumber: string;
  codeMatches: string;
  expirationQualifies: string;
  expirationEntryType: string;
  expirationDate: string;
  discrepancyCategories: string[];
  discrepancyNotes: string;
  adjustmentRequired: string;
  managementReview: string;
  returnRequired: string;
  quotationAdjusted: string;
  proposedRevisedAmount: string;
  adjustmentReason: string;
  adjustmentNotes: string;
  quantityToReturn: string;
  returnStatus: string;
  returnTracking: string;
  returnNotes: string;
  lots: LotState[];
};

const num = (n: number | null | undefined) => (n == null ? "" : String(n));

export function toItemState(i: ItemView): ItemState {
  return {
    id: i.id,
    quotedItemId: i.quotedItemId,
    productName: i.productName,
    itemSource: i.itemSource,
    quotedQuantity: i.quotedQuantity,
    quotedAmount: i.quotedAmount,
    wasReceived: i.wasReceived,
    quantityReceived: num(i.quantityReceived),
    condition: i.condition,
    needsReturn: i.needsReturn,
    notes: i.notes,
    ndc: i.ndc,
    lotNumber: i.lotNumber,
    codeMatches: i.codeMatches,
    expirationQualifies: i.expirationQualifies,
    expirationEntryType: i.expirationEntryType,
    expirationDate: i.expirationDate,
    discrepancyCategories: i.discrepancyCategories,
    discrepancyNotes: i.discrepancyNotes,
    adjustmentRequired: i.adjustmentRequired,
    managementReview: i.managementReview,
    returnRequired: i.returnRequired,
    quotationAdjusted: i.quotationAdjusted,
    proposedRevisedAmount: num(i.proposedRevisedAmount),
    adjustmentReason: i.adjustmentReason,
    adjustmentNotes: i.adjustmentNotes,
    quantityToReturn: num(i.quantityToReturn),
    returnStatus: i.returnStatus,
    returnTracking: i.returnTracking,
    returnNotes: i.returnNotes,
    lots: i.lots.map((l) => ({
      label: l.label,
      lotNumber: l.lotNumber,
      expirationDate: l.expirationDate,
      expirationEndDate: l.expirationEndDate,
      quantity: num(l.quantity),
    })),
  };
}

const toInt = (s: string): number | null => (s.trim() !== "" && Number.isInteger(Number(s)) ? Number(s) : null);

export function itemFactsOf(i: ItemState): ItemFacts {
  return {
    productName: i.productName,
    quotedItemId: i.quotedItemId,
    itemSource: i.itemSource,
    quotedQuantity: i.quotedQuantity,
    wasReceived: i.wasReceived,
    quantityReceived: toInt(i.quantityReceived),
    codeMatches: i.codeMatches,
    expirationQualifies: i.expirationQualifies,
    needsReturn: i.needsReturn,
    quantityToReturn: toInt(i.quantityToReturn),
    returnStatus: i.returnStatus,
  };
}

export function itemLotsMismatch(i: ItemState): boolean {
  return lotsMismatch(toInt(i.quantityReceived), i.lots.map((l) => toInt(l.quantity)));
}

const small = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";
const RECEIVED: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "good" },
  { value: "PARTIALLY", label: "Partially", tone: "warn" },
  { value: "NO", label: "No", tone: "bad" },
];
const RETURN_NEEDED: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "bad" },
  { value: "NO", label: "No", tone: "good" },
  { value: "PENDING_REVIEW", label: "Pending review", tone: "warn" },
];
const EXP_OK: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "good" },
  { value: "NO", label: "No", tone: "bad" },
  { value: "REVIEW_REQUIRED", label: "Review required", tone: "warn" },
  { value: "NA", label: "N/A", tone: "warn" },
];
const QUOTATION_ADJUSTED: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "good" },
  { value: "NO", label: "No", tone: "bad" },
  { value: "PENDING", label: "Pending", tone: "warn" },
];

type CardProps = {
  item: ItemState;
  onChange: (patch: Partial<ItemState>) => void;
  editable: boolean;
};

/** The extra detail for one received line (the main fields live in the table row above it). */
export function ItemDetailsPanel({
  item,
  onChange,
  editable,
  packageId,
  photos,
  storageOk,
  onError,
}: CardProps & { packageId: string; photos: PackagePhoto[]; storageOk: boolean; onError: (m: string) => void }) {
  const mismatch = itemLotsMismatch(item);
  const notReceived = item.wasReceived === "NO";
  const entry = item.expirationEntryType;
  const slot = (kind: "ITEM_PRODUCT" | "ITEM_DAMAGE" | "ITEM_DISCREPANCY" | "ITEM_EXPIRATION") => (
    <PhotoSlot packageId={packageId} kind={kind} itemId={item.id} photos={photos} editable={editable} storageOk={storageOk} onError={onError} compact />
  );
  const setLot = (idx: number, patch: Partial<LotState>) => onChange({ lots: item.lots.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className={small}>Was Product Received?</span>
        <Choice
          name={`Was received ${item.id}`}
          value={item.wasReceived}
          disabled={!editable}
          options={RECEIVED}
          onChange={(v) => onChange(v === "NO" ? { wasReceived: v, quantityReceived: "0" } : { wasReceived: v })}
        />
      </div>
      <div>
        <span className={small}>Product Code Matches?</span>
        <Choice name={`Code matches ${item.id}`} value={item.codeMatches} disabled={!editable || notReceived} options={YN_NA} onChange={(v) => onChange({ codeMatches: v })} />
      </div>
      <div>
        <span className={small}>Expiration Qualifies?</span>
        <Choice name={`Expiration qualifies ${item.id}`} value={item.expirationQualifies} disabled={!editable || notReceived} options={EXP_OK} onChange={(v) => onChange({ expirationQualifies: v })} />
      </div>

      <div className="sm:col-span-2">
        <label className={small} htmlFor={`exptype-${item.id}`}>Expiration Date Entry</label>
        <select
          id={`exptype-${item.id}`}
          className={`${field} sm:w-64`}
          disabled={!editable || notReceived}
          value={entry}
          onChange={(e) => {
            const v = e.target.value;
            const patch: Partial<ItemState> = { expirationEntryType: v };
            if ((v === "RANGE" || v === "MULTIPLE") && item.lots.length === 0) patch.lots = [{ label: "", lotNumber: item.lotNumber, expirationDate: "", expirationEndDate: "", quantity: "" }];
            onChange(patch);
          }}
        >
          <option value="">Choose…</option>
          <option value="SINGLE">One date (in the table)</option>
          <option value="RANGE">A date range</option>
          <option value="MULTIPLE">Several lots / dates</option>
          <option value="NA">No expiration</option>
        </select>
        {(entry === "RANGE" || entry === "MULTIPLE") && (
          <div className="mt-2 space-y-2">
            {item.lots.map((l, idx) => (
              <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_5rem_auto] dark:border-slate-700">
                <div>
                  <label className={small} htmlFor={`lotno-${item.id}-${idx}`}>Lot Number</label>
                  <input id={`lotno-${item.id}-${idx}`} className={field} maxLength={60} disabled={!editable} value={l.lotNumber} onChange={(e) => setLot(idx, { lotNumber: e.target.value })} />
                </div>
                <div>
                  <label className={small} htmlFor={`lotlabel-${item.id}-${idx}`}>Label (optional)</label>
                  <input id={`lotlabel-${item.id}-${idx}`} className={field} maxLength={80} disabled={!editable} value={l.label} onChange={(e) => setLot(idx, { label: e.target.value })} />
                </div>
                <div>
                  <label className={small} htmlFor={`lotdate-${item.id}-${idx}`}>{entry === "RANGE" ? "Earliest Expiration" : "Expiration"}</label>
                  <input id={`lotdate-${item.id}-${idx}`} type="date" className={field} disabled={!editable} value={l.expirationDate} onChange={(e) => setLot(idx, { expirationDate: e.target.value })} />
                </div>
                <div>
                  <label className={small} htmlFor={`lotend-${item.id}-${idx}`}>{entry === "RANGE" ? "Latest Expiration" : "End (optional)"}</label>
                  <input id={`lotend-${item.id}-${idx}`} type="date" className={field} disabled={!editable} value={l.expirationEndDate} onChange={(e) => setLot(idx, { expirationEndDate: e.target.value })} />
                </div>
                <div>
                  <label className={small} htmlFor={`lotqty-${item.id}-${idx}`}>Qty</label>
                  <input id={`lotqty-${item.id}-${idx}`} type="number" min={0} step={1} className={field} disabled={!editable} value={l.quantity} onChange={(e) => setLot(idx, { quantity: e.target.value })} />
                </div>
                {editable && (
                  <button type="button" onClick={() => onChange({ lots: item.lots.filter((_, i) => i !== idx) })} aria-label="Remove this row" className="self-end rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-600 hover:bg-red-50 hover:text-red-800 dark:border-slate-700">
                    ×
                  </button>
                )}
              </div>
            ))}
            {editable && item.lots.length < 25 && (
              <button type="button" onClick={() => onChange({ lots: [...item.lots, { label: "", lotNumber: "", expirationDate: "", expirationEndDate: "", quantity: "" }] })} className="rounded-lg border border-dashed border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40">
                + Add another lot / date
              </button>
            )}
            {mismatch && <p className="text-xs font-medium text-orange-800 dark:text-orange-300">The lot quantities don&apos;t add up to the quantity received.</p>}
          </div>
        )}
      </div>

      {item.needsReturn === "YES" && (
        <>
          <div>
            <label className={small} htmlFor={`rqty-${item.id}`}>Quantity To Return</label>
            <input id={`rqty-${item.id}`} type="number" min={0} step={1} className={field} disabled={!editable} value={item.quantityToReturn} onChange={(e) => onChange({ quantityToReturn: e.target.value })} />
          </div>
          <div>
            <label className={small} htmlFor={`rstat-${item.id}`}>Return Status</label>
            <select id={`rstat-${item.id}`} className={field} disabled={!editable} value={item.returnStatus} onChange={(e) => onChange({ returnStatus: e.target.value })}>
              <option value="">Choose…</option>
              {Object.entries(RETURN_STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className={small} htmlFor={`rtrack-${item.id}`}>Return Tracking #</label>
            <input id={`rtrack-${item.id}`} className={field} maxLength={80} disabled={!editable} value={item.returnTracking} onChange={(e) => onChange({ returnTracking: e.target.value })} />
          </div>
          <div>
            <label className={small} htmlFor={`rnotes-${item.id}`}>Return Notes</label>
            <input id={`rnotes-${item.id}`} className={field} disabled={!editable} value={item.returnNotes} onChange={(e) => onChange({ returnNotes: e.target.value })} />
          </div>
        </>
      )}
      <div className="sm:col-span-2">
        <label className={small} htmlFor={`notes-${item.id}`}>Product Notes</label>
        <textarea id={`notes-${item.id}`} rows={2} className={field} disabled={!editable} value={item.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>

      <div className="sm:col-span-2">
        <span className={small}>Discrepancy Category</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {DISCREPANCY_OPTIONS.map((c) => (
            <label key={c} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                disabled={!editable}
                checked={item.discrepancyCategories.includes(c)}
                onChange={(e) => onChange({ discrepancyCategories: e.target.checked ? [...item.discrepancyCategories, c] : item.discrepancyCategories.filter((x) => x !== c) })}
                className="h-4 w-4 accent-amber-600"
              />
              {c}
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className={small} htmlFor={`dnotes-${item.id}`}>Discrepancy Notes</label>
        <textarea id={`dnotes-${item.id}`} rows={2} className={field} disabled={!editable} value={item.discrepancyNotes} onChange={(e) => onChange({ discrepancyNotes: e.target.value })} />
      </div>

      <div><span className={small}>Product Photos</span>{slot("ITEM_PRODUCT")}</div>
      <div><span className={small}>Expiration Photos</span>{slot("ITEM_EXPIRATION")}</div>
      <div><span className={small}>Damage Photos</span>{slot("ITEM_DAMAGE")}</div>
      <div><span className={small}>Discrepancy Photos</span>{slot("ITEM_DISCREPANCY")}</div>
    </div>
  );
}

/** Step 7: the per-product adjustment fields. */
export function ItemAdjustmentCard({ item, onChange, editable, flagged }: CardProps & { flagged: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.productName}</h3>
        {flagged && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">Flagged</span>}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <span className={small}>Adjustment Required?</span>
          <Choice name={`Adjustment required ${item.id}`} value={item.adjustmentRequired} disabled={!editable} options={YN_RISK} onChange={(v) => onChange({ adjustmentRequired: v })} allowClear />
        </div>
        <div>
          <span className={small}>Management Review?</span>
          <Choice name={`Management review ${item.id}`} value={item.managementReview} disabled={!editable} options={YN_RISK} onChange={(v) => onChange({ managementReview: v })} allowClear />
        </div>
        <div>
          <span className={small}>Return Required?</span>
          <Choice name={`Return required ${item.id}`} value={item.returnRequired} disabled={!editable} options={YN_RISK} onChange={(v) => onChange({ returnRequired: v })} allowClear />
        </div>
        <div>
          <span className={small}>Quotation Adjusted?</span>
          <Choice name={`Quotation adjusted ${item.id}`} value={item.quotationAdjusted} disabled={!editable} options={QUOTATION_ADJUSTED} onChange={(v) => onChange({ quotationAdjusted: v })} allowClear />
        </div>
        <div>
          <label className={small} htmlFor={`prop-${item.id}`}>Proposed Revised Amount</label>
          <input id={`prop-${item.id}`} inputMode="decimal" placeholder="0.00" className={field} disabled={!editable} value={item.proposedRevisedAmount} onChange={(e) => onChange({ proposedRevisedAmount: e.target.value })} />
        </div>
        <div>
          <label className={small} htmlFor={`reason-${item.id}`}>Adjustment Reason</label>
          <select id={`reason-${item.id}`} className={field} disabled={!editable} value={item.adjustmentReason} onChange={(e) => onChange({ adjustmentReason: e.target.value })}>
            <option value="">Choose…</option>
            {ADJUSTMENT_REASON_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={small} htmlFor={`anotes-${item.id}`}>Adjustment Notes</label>
          <textarea id={`anotes-${item.id}`} rows={2} className={field} disabled={!editable} value={item.adjustmentNotes} onChange={(e) => onChange({ adjustmentNotes: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
