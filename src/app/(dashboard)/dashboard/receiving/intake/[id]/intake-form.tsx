"use client";

import { AdjustmentSection, type AdjustmentChange } from "./adjustment-section";
import type { AdjustmentView } from "@/lib/receiving-adjustment-service";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteReceivingItem,
  reopenReceiving,
  saveFollowUp,
  saveReceiving,
  submitReceiving,
} from "@/app/actions/receiving";
import type { AdjustmentSummary, CatalogProduct, PackagePhoto, QuotationBrief, QuotedLine, ItemView, TeamMember } from "@/lib/receiving-queries";
import {
  ACCOUNTS_DECISION_LABELS,
  ACCOUNTS_STATUS_LABELS,
  DAMAGE_TYPES,
  STATUS_LABELS,
  computeMissingInfo,
  discrepancyFlags,
  finalPayout,
  finalStatusFor,
  formatMoney,
  summarizeItems,
  quotedNotEntered,
  RETURN_STATUS_LABELS,
  type PhotoKind,
} from "@/lib/receiving-rules";
import { MONEY, STATUS_PILL, chipClass, formatUtcStamp } from "@/lib/receiving-ui";
import { MarkPaidButton } from "@/app/(dashboard)/dashboard/accounts/mark-paid-button";
import { LocalTime } from "@/components/local-time";
import { Choice, PhotoAddContext, PhotoSlot, Row, Step, YN, YN_RISK, field } from "./intake-parts";
import { ItemAdjustmentCard, itemFactsOf, toItemState, type ItemState } from "./item-card";
import { ReceiptPreview, ReceivedItemsGrid } from "./receiving-table";
import { RecallCheck } from "./recall-check";
import { ScanStation } from "./scan-station";
import { NumbersTab, numbersFor } from "./numbers-tab";
import type { SerialView } from "@/lib/receiving-serial-service";
import { severityOf } from "@/lib/receiving-serial-rules";
import { RowScanDialog } from "./row-scan-dialog";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import { recallsForProduct, rowRecallState } from "@/lib/receiving-recall";
import { needsRecallChecker } from "@/lib/recall-watch";

export type FormValues = {
  trackingNumber: string;
  carrier: string;
  receivedAt: string;
  receivedByUserId: string;
  externalDamage: string;
  damageTypes: string[];
  damageNotes: string;
  doubleBoxed: string;
  protectiveMaterial: string;
  sturdyOuterBox: string;
  productsSecured: string;
  packageSealed: string;
  packagingRequirementsMet: string;
  overallPackaging: string;
  packagingIssueNotes: string;
  packingSheetIncluded: string;
  quantityMatches: string;
  adjustmentNeeded: string;
  adjustmentDetails: string;
  receivingNotes: string;
  adjustedOrderTotal: string;
  adjustmentAmountEmail: string;
  customerEmailNote: string;
  accountsDecision: string;
  accountsStatus: string;
  customerTexted: boolean;
};

type Props = {
  packageId: string;
  status: keyof typeof STATUS_LABELS;
  canWrite: boolean;
  canAccounts: boolean;
  /** Accounts team only (accountant, Admin, Owner): may change Step 10. */
  canPayment: boolean;
  /** "accounts": the Accounts department is showing this record. Everything is read-only except Step 10, which is highlighted and gets the Mark as Paid button. */
  focus?: "accounts";
  isAdminUser: boolean;
  storageOk: boolean;
  brief: QuotationBrief;
  receipt: { present: boolean; isImage: boolean };
  tracking: { packageStatus: string | null; lastUpdate: string | null; deliveredAt: string | null };
  team: TeamMember[];
  duplicates: { number: string; tracking: string | null }[];
  settings: { emailsEnabled: boolean };
  /** The full adjustment quotation (built inline in Step 7), or null when none has been started. */
  adjustmentView: AdjustmentView | null;
  recalls: RecallView[];
  recallChecks: RecallCheckView[];
  serials: SerialView[];
  photoReading: boolean;
  photos: PackagePhoto[];
  items: ItemView[];
  quotedLines: QuotedLine[];
  adjustment: AdjustmentSummary | null;
  started: { at: string; byName: string | null };
  catalog: CatalogProduct[];
  saved: {
    accountsStatus: string;
    paidAt: string | null;
    submittedAt: string | null;
    submittedByUserId: string | null;
    createdAt: string;
    customerNotifiedAt: string | null;
    packagingWarningSentAt: string | null;
  };
  initial: FormValues;
};

const STEPS = [
  "The Order",
  "Arrival",
  "Condition",
  "Packaging",
  "Contents",
  "Verify Products",
  "Adjustments",
  "Customer Note",
  "Completion",
  "Accounts",
];

const fieldKeysForAccounts = ["adjustedOrderTotal", "adjustmentAmountEmail", "customerEmailNote", "accountsDecision", "accountsStatus"] as const;

/** Step 10 as the Accounts department sees it: status, the amount, the receipt and the one button that marks the order Paid. */
function AccountsPayment({
  packageId,
  photos,
  storageOk,
  canPayment,
  decision,
  paid,
  submitted,
  paidAt,
  amount,
  quoted,
  onError,
}: {
  packageId: string;
  photos: PackagePhoto[];
  storageOk: boolean;
  canPayment: boolean;
  decision: string;
  paid: boolean;
  submitted: boolean;
  paidAt: string | null;
  amount: number;
  quoted: number;
  onError: (m: string) => void;
}) {
  const waiting = !paid && submitted && decision === "NEED_TO_BE_PAID";
  const receipts = photos.filter((p) => p.kind === "PAYMENT_CONFIRMATION");
  const canChange = canPayment && waiting;
  return (
    <div data-testid="accounts-payment">
      <p role="note" className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
        {paid
          ? "This order has been paid."
          : waiting
            ? "Pay this order by ACH direct deposit on your payables system, attach a screenshot of the receipt below, then mark it Paid. The date and time are stamped for you."
            : "Receiving hasn't sent this order to Accounts yet (it must be submitted and set to Need to Be Paid), so it can't be paid from here."}
      </p>
      <Row label="Accounts Status">
        <span data-testid="order-state" className={`rounded-full px-2.5 py-1 text-xs font-medium ${paid ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : waiting ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100" : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}>
          {paid ? "Paid" : waiting ? "Need to Be Paid" : "Not waiting for payment"}
        </span>
      </Row>
      <Row label={paid ? "Amount Paid" : "Amount To Pay"}>
        <span className="text-lg font-bold tabular-nums" data-testid="order-amount">{MONEY.format(amount)}</span>
        {amount !== quoted && <span className="ml-2 text-xs text-slate-500">Quoted {MONEY.format(quoted)}, adjusted by Receiving</span>}
      </Row>
      <Row label="Paid Date/Time">
        {paid ? <span data-testid="paid-stamp" suppressHydrationWarning>{formatUtcStamp(paidAt)} <span className="text-xs text-slate-500">· ACH direct deposit</span></span> : <span className="text-slate-500">Filled in automatically when you mark the order Paid.</span>}
      </Row>
      <Row label="Payment Receipt" hint="A screenshot from your payables system (or a PDF).">
        <div data-testid="receipt-slot">
          <PhotoSlot packageId={packageId} kind="PAYMENT_CONFIRMATION" photos={photos} editable={canChange} canAdd={canChange} storageOk={storageOk} onError={onError} />
          {receipts.length === 0 && !canChange && <span className="text-slate-500">None attached.</span>}
        </div>
      </Row>
      {waiting && canPayment && (
        <Row label="Mark as Paid">
          <MarkPaidButton packageId={packageId} hasReceipt={receipts.length > 0} />
        </Row>
      )}
    </div>
  );
}

export function IntakeForm(props: Props) {
  const { packageId, status, canWrite, canAccounts, canPayment, storageOk, brief, receipt, photos, saved } = props;
  const router = useRouter();
  const [v, setV] = useState<FormValues>(props.initial);
  const [edits, setEdits] = useState<Record<string, ItemState>>({});
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [missingAfterSubmit, setMissingAfterSubmit] = useState<string[] | null>(null);

  const locked = status !== "IN_PROGRESS";
  const editable = canWrite;
  const accountsFocus = props.focus === "accounts";
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  // Product lines: the server's list, with whatever the agent has typed over the top.
  const items: ItemState[] = props.items.map((pi) => edits[pi.id] ?? toItemState(pi));
  function patchMany(updates: Record<string, Partial<ItemState>>) {
    setEdits((e) => {
      const next = { ...e };
      for (const [id, patch] of Object.entries(updates)) {
        const base = next[id] ?? items.find((i) => i.id === id);
        if (base) next[id] = { ...base, ...patch };
      }
      return next;
    });
  }

  // Recall checks made in Step 6 (saved on the server as they are made).
  const [recallChecks, setRecallChecks] = useState<RecallCheckView[]>(props.recallChecks);
  const [serials, setSerials] = useState<SerialView[]>(props.serials);
  // Step 6 has four tabs. Every tab stays on the page (just hidden) so nothing typed in one is lost by looking at another.
  const [step6Tab, setStep6Tab] = useState<"items" | "numbers" | "scan" | "recall">("items");
  const [numbersItemId, setNumbersItemId] = useState("");
  const [recalls, setRecalls] = useState<RecallView[]>(props.recalls);
  const [scanItemId, setScanItemId] = useState<string | null>(null);
  // The recall checker switches itself on the moment a product that needs it is chosen on a row (Dexcom G7, Omnipod,
  // FreeStyle Libre 3 / 3 Plus, or anything on an active recall). Rows already on the shipment when it opened do not
  // jump the screen; only a product chosen now does, once per row and product.
  const [recallSeen, setRecallSeen] = useState<Record<string, string>>(() => Object.fromEntries(props.items.map((i) => [i.id, i.productName.trim().toLowerCase()])));
  const [recallFocus, setRecallFocus] = useState<{ rowId: string; n: number } | null>(null);
  {
    // Adjusting state while rendering (React's own pattern for "when X changes, set Y").
    const changed = editable ? items.filter((i) => (recallSeen[i.id] ?? "") !== i.productName.trim().toLowerCase()) : [];
    if (changed.length > 0) {
      setRecallSeen((m) => ({ ...m, ...Object.fromEntries(changed.map((i) => [i.id, i.productName.trim().toLowerCase()])) }));
      const hit = changed.find((i) => needsRecallChecker(i.productName));
      if (hit) {
        setRecallFocus((f) => ({ rowId: hit.id, n: (f?.n ?? 0) + 1 }));
        setStep6Tab("recall");
      }
    }
  }
  const recallStates: Record<string, "RECALLED" | "CHECKED"> = {};
  for (const it of props.items) {
    const st = rowRecallState(recallChecks.filter((c) => c.itemId === it.id));
    if (st !== "NONE") recallStates[it.id] = st;
  }
  const scanFlagged = serials.filter((x) => severityOf(x.flags) === "stop").length;
  const recalledNames = items.filter((i) => recallStates[i.id] === "RECALLED").map((i) => i.productName);
  const checkedCount = Object.keys(recallStates).length;
  // Products that point at a recall (by name) but were never checked.
  const unchecked = items
    .filter((i) => i.productName.trim() && i.wasReceived !== "NO" && !recallStates[i.id] && recallsForProduct(i.productName, recalls.filter((r) => r.active)).length > 0)
    .map((i) => i.productName);

  const counts: Partial<Record<PhotoKind, number>> = {};
  for (const p of photos) if (!p.itemId) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const itemFacts = items.map(itemFactsOf);
  const flags = discrepancyFlags(itemFacts);
  const facts = { ...v };
  // Recall-risk products can't be submitted without a real check (the same rule the server enforces).
  const recallGate: string[] = [];
  for (const i of items) {
    if (!i.productName.trim() || i.wasReceived === "NO" || !((parseInt(i.quantityReceived, 10) || 0) > 0)) continue;
    const mine = recallChecks.filter((c) => c.itemId === i.id);
    for (const r of recallsForProduct(i.productName, recalls.filter((x) => x.active))) {
      if (r.numberCount + r.prefixCount > 0) {
        if (!mine.some((c) => c.result === "ON_LIST" || c.result === "NOT_ON_LIST" || c.recallId === r.id)) recallGate.push(`${i.productName.trim()}: recall check needed (${r.name}). Enter or scan its lot or serial number in Step 6.`);
      } else if (!mine.some((c) => c.recallId === r.id && (c.result === "CONFIRMED_OK" || c.result === "CONFIRMED_AFFECTED"))) {
        recallGate.push(`${i.productName.trim()}: ${r.name} has no list loaded here, so look its number up on ${r.manufacturer || "the manufacturer"}'s page and record the result in Step 6.`);
      }
    }
  }
  const missing = [...computeMissingInfo(facts, counts, itemFacts), ...recallGate];
  // Quoted products nothing has been entered for yet count as shortages. Blank rows (no product chosen) are not lines yet.
  const namedFacts = itemFacts.filter((f) => f.productName?.trim());
  const notEntered = quotedNotEntered(props.quotedLines, namedFacts);
  const finalStatus = finalStatusFor(facts, namedFacts, notEntered.length);
  const summary = summarizeItems(namedFacts, notEntered.length);
  // Received lines (something actually arrived) with no lot number typed on the line or on any of its expiration lots.
  const missingLots = items
    .filter((i) => i.productName.trim() && i.wasReceived !== "NO" && (parseInt(i.quantityReceived, 10) || 0) > 0 && !i.lotNumber.trim() && !i.lots.some((l) => l.lotNumber.trim()))
    .map((i) => i.productName);

  const total = brief.grandTotal;
  const adjustedNum = v.adjustedOrderTotal.trim() === "" ? null : Number(v.adjustedOrderTotal.replace(/[$,\s]/g, ""));
  const adjustedValid = adjustedNum == null || Number.isFinite(adjustedNum);
  const payout = finalPayout(total, adjustedValid ? adjustedNum : null);
  const suggestedChange = adjustedValid && adjustedNum != null ? Math.round((adjustedNum - total) * 100) / 100 : null;
  const submittedBy = props.team.find((t) => t.userId === saved.submittedByUserId)?.name;

  function receivingFormData() {
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) {
      if (Array.isArray(val)) val.forEach((x) => fd.append(k, x));
      else fd.set(k, typeof val === "boolean" ? String(val) : val);
    }
    fd.set("itemsJson", JSON.stringify(items));
    return fd;
  }
  function accountsFormData() {
    const fd = new FormData();
    for (const k of fieldKeysForAccounts) fd.set(k, v[k]);
    fd.set("customerTexted", String(v.customerTexted));
    return fd;
  }

  function run(kind: "save" | "submit" | "accounts") {
    setError("");
    setMessage("");
    setMissingAfterSubmit(null);
    startTransition(async () => {
      const res =
        kind === "accounts"
          ? await saveFollowUp(packageId, accountsFormData())
          : kind === "save"
            ? await saveReceiving(packageId, receivingFormData())
            : await submitReceiving(packageId, receivingFormData());
      if (res.error) {
        setError(res.error);
        if (res.missing) setMissingAfterSubmit(res.missing);
        return;
      }
      if (res.recallChecks) setRecallChecks(res.recallChecks);
      if (res.itemPatches) patchMany(res.itemPatches as Record<string, Partial<ItemState>>);
      const base = kind === "submit" ? "Submitted. The order is now marked Received." : "Saved.";
      setMessage(res.notice ? `${base} ${res.notice}` : base);
      router.refresh();
    });
  }

  /** The adjustment quotation is built from what is saved, so save the form first. Starting one also answers "Adjustment needed?" with Yes. */
  async function saveBeforeAdjustment(): Promise<string | null> {
    if (v.adjustmentNeeded !== "YES") set("adjustmentNeeded", "YES");
    if (!editable) return null;
    const fd = receivingFormData();
    fd.set("adjustmentNeeded", "YES");
    const res = await saveReceiving(packageId, fd);
    return res.error ?? null;
  }

  function onAdjustmentChanged(e: AdjustmentChange) {
    if (e.kind === "finalized") {
      set("adjustedOrderTotal", String(e.adjustedTotal));
      set("adjustmentAmountEmail", String(e.difference));
    }
    if (e.kind === "discarded") {
      if (Number(v.adjustedOrderTotal) === e.adjustedTotal) {
        set("adjustedOrderTotal", "");
        set("adjustmentAmountEmail", "");
      }
    }
  }

  function reopen() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const res = await reopenReceiving(packageId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function removeItems(ids: string[]) {
    const one = ids.length === 1;
    if (!window.confirm(one ? "Delete this whole row, including its photos?" : `Delete these ${ids.length} rows, including their photos?`)) return;
    setError("");
    startTransition(async () => {
      let quoted: Awaited<ReturnType<typeof deleteReceivingItem>>["quoted"];
      for (const id of ids) {
        const res = await deleteReceivingItem(packageId, id);
        if (res.error) {
          setError(res.error);
          break;
        }
        quoted = res.quoted;
      }
      if (quoted) {
        const updates: Record<string, Partial<ItemState>> = {};
        for (const [id, link] of Object.entries(quoted)) updates[id] = { ...link };
        patchMany(updates);
      }
      router.refresh();
    });
  }

  const slot = (kind: PhotoKind, opts?: { accounts?: boolean; payment?: boolean }) => (
    <PhotoSlot packageId={packageId} kind={kind} photos={photos} editable={opts?.payment ? canPayment : opts?.accounts ? canAccounts : editable} canAdd={opts?.payment ? canPayment : opts?.accounts ? canAccounts : canWrite} storageOk={storageOk} onError={setError} />
  );
  const textInput = (id: keyof FormValues, rows?: number) =>
    rows ? (
      <textarea id={id} rows={rows} className={field} value={v[id] as string} onChange={(e) => set(id, e.target.value as never)} />
    ) : (
      <input id={id} className={field} value={v[id] as string} onChange={(e) => set(id, e.target.value as never)} />
    );

  return (
    <PhotoAddContext.Provider value={canWrite}>
    <article className="mx-auto max-w-[100rem]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50">
            {brief.customerName} — {brief.quotationNumber}
            {v.trackingNumber ? ` — ${v.trackingNumber}` : ""}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${chipClass(brief.customerName)}`}>{brief.customerName}</span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${STATUS_PILL[status]}`}>{STATUS_LABELS[status]}</span>
            {v.accountsStatus && (
              <span className={`rounded-full px-2.5 py-1 font-medium ${v.accountsStatus === "PAID" ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"}`}>
                {ACCOUNTS_STATUS_LABELS[v.accountsStatus as keyof typeof ACCOUNTS_STATUS_LABELS]}
              </span>
            )}
          </div>
        </div>
        {canWrite && locked && (
          <button onClick={reopen} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
            Reopen to edit
          </button>
        )}
      </header>
      {accountsFocus && saved.accountsStatus === "PAID" && (
        <div role="note" data-testid="paid-banner" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100">
          <span aria-hidden="true" className="-rotate-3 rounded-md border-2 border-green-700 px-3 py-1 text-lg font-extrabold tracking-[0.25em] text-green-800 dark:border-green-400 dark:text-green-300">PAID</span>
          <span className="text-sm">
            <strong suppressHydrationWarning>{formatUtcStamp(saved.paidAt)}</strong> · ACH direct deposit · <strong className="tabular-nums">{MONEY.format(payout)}</strong>
          </span>
          <a href="#step-10" className="ml-auto rounded-md bg-green-700 px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110">See the receipt in Step 10 ↓</a>
        </div>
      )}
      {accountsFocus && saved.accountsStatus !== "PAID" && (
        <p role="note" data-testid="accounts-banner" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <span>This is the complete receiving record, for your review. Accounts works in <strong>Step 10</strong> at the bottom.</span>
          <a href="#step-10" className="rounded-md bg-[var(--dept-accent,#60a5fa)] px-2.5 py-1 text-xs font-semibold text-emerald-950 hover:brightness-95">Go to Step 10 ↓</a>
        </p>
      )}
      {!accountsFocus && !canWrite && !canAccounts && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Your role can view Receiving but can&apos;t make changes.</p>}
      {props.duplicates.length > 0 && (
        <p role="status" className="mt-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
          Possible duplicate order: another order has the same reference or tracking number ({props.duplicates.map((d) => d.number).join(", ")}). Check before paying.
        </p>
      )}

      <nav aria-label="Steps" className="sticky top-0 z-10 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-stone-50/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8 dark:border-slate-800 dark:bg-slate-950/95">
        {STEPS.map((s, i) => (
          <a
            key={s}
            href={`#step-${i + 1}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600 ${
              accountsFocus && i === 9
                ? "border-[var(--dept-accent,#60a5fa)] bg-[var(--dept-accent,#60a5fa)] font-bold text-emerald-950"
                : "border-slate-300 bg-white text-slate-700 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-amber-950/30"
            }`}
          >
            <span className={`font-bold ${accountsFocus && i === 9 ? "" : "text-amber-800 dark:text-amber-300"}`}>{i + 1}</span> {s}
          </a>
        ))}
      </nav>

      {/* STEP 1 */}
      <Step n={1} id="step-1" title="The order (from the Quotation Summary)">
        <Row label="Order Reference">{brief.quotationNumber}</Row>
        <Row label="Customer Name">{brief.customerName}</Row>
        <Row label="Customer Email / Phone">{[brief.email, brief.phone].filter(Boolean).join(" · ") || "—"}</Row>
        <Row label="Shipping Address"><span className="whitespace-pre-line">{brief.shippingAddress}</span></Row>
        <Row label="Order Date">{brief.quotationDate}</Row>
        <Row label="Order Total">
          <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium tabular-nums text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">{MONEY.format(total)}</span>
        </Row>
        <Row label="Items Quoted For This Order"><span className="whitespace-pre-line">{brief.itemsText}</span></Row>
        <Row label="Quotation / Invoice">
          <span className="text-slate-600 dark:text-slate-400">Shown in full under Step 6, next to what you receive.</span>
          {receipt.present ? (
            <a href={`/api/receiving/packages/${packageId}/quotation-receipt`} target="_blank" rel="noreferrer" className="ml-2 text-xs font-medium text-amber-800 underline dark:text-amber-300">Open in a new tab</a>
          ) : (
            <span className="ml-2 text-xs text-slate-500">(none on file)</span>
          )}
        </Row>
      </Step>

      <fieldset disabled={!editable} className="min-w-0 border-0 p-0">
        {/* STEP 2 */}
        <Step n={2} id="step-2" title="Arrival" note="Tracking number and carrier come from the order; change them if the package that arrived is different.">
          <Row label="Order Tracking Number">
            <input id="trackingNumber" className={field} value={v.trackingNumber} maxLength={80} onChange={(e) => set("trackingNumber", e.target.value)} />
          </Row>
          <Row label="Carrier">
            <select id="carrier" className={field} value={v.carrier} onChange={(e) => set("carrier", e.target.value)}>
              <option value="">Choose…</option>
              {["UPS", "USPS", "FedEx", "Other"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Row>
          <Row label="Carrier Tracking Status">
            {props.tracking.packageStatus ? (
              <span>
                {props.tracking.packageStatus}
                {props.tracking.lastUpdate ? <span className="text-slate-500"> · updated <span suppressHydrationWarning>{formatUtcStamp(props.tracking.lastUpdate)}</span></span> : null}
                {props.tracking.deliveredAt ? <span className="text-slate-500"> · delivered <span suppressHydrationWarning>{formatUtcStamp(props.tracking.deliveredAt)}</span></span> : null}
              </span>
            ) : (
              <span className="text-slate-500">No carrier update yet</span>
            )}
          </Row>
          <Row label="Receiving Started" hint="Stamped automatically when the package was opened. It can't be changed.">
            <span className="inline-flex flex-wrap items-center gap-x-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium dark:bg-slate-800">
              <span aria-hidden="true">🔒</span>
              <LocalTime value={props.started.at} />
              <span className="text-slate-600 dark:text-slate-400">by {props.started.byName ?? "—"}</span>
            </span>
          </Row>
          <Row label="Date/Time Received">
            <div className="flex flex-wrap items-center gap-2">
              <input id="receivedAt" type="datetime-local" className={`${field} sm:w-auto`} value={v.receivedAt} onChange={(e) => set("receivedAt", e.target.value)} />
              {editable && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                  onClick={() => {
                    const d = new Date();
                    const p = (n: number) => String(n).padStart(2, "0");
                    set("receivedAt", `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
                  }}
                >
                  Now
                </button>
              )}
            </div>
          </Row>
          <Row label="Received By">
            <select id="receivedByUserId" className={`${field} sm:w-72`} value={v.receivedByUserId} onChange={(e) => set("receivedByUserId", e.target.value)}>
              <option value="">Choose…</option>
              {props.team.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
            </select>
          </Row>
          <Row label="Photo - Unopened Package">{slot("UNOPENED_PACKAGE")}</Row>
          <Row label="Photo - Shipping Label">{slot("SHIPPING_LABEL")}</Row>
        </Step>

        {/* STEP 3 */}
        <Step n={3} id="step-3" title="Condition on arrival">
          <Row label="External Damage?">
            <Choice name="External Damage?" value={v.externalDamage} onChange={(x) => set("externalDamage", x)} options={YN_RISK} disabled={!editable} />
          </Row>
          {v.externalDamage === "YES" && (
            <>
              <Row label="Damage Type">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {DAMAGE_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={v.damageTypes.includes(t)}
                        onChange={(e) => set("damageTypes", e.target.checked ? [...v.damageTypes, t] : v.damageTypes.filter((x) => x !== t))}
                        className="h-4 w-4 accent-amber-600"
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </Row>
              <Row label="Damage Notes">{textInput("damageNotes", 2)}</Row>
              <Row label="Damage Photos">{slot("DAMAGE")}</Row>
            </>
          )}
          <Row label="Photo - Package As Opened">{slot("PACKAGE_AS_OPENED")}</Row>
        </Step>

        {/* STEP 4 */}
        <Step n={4} id="step-4" title="Packaging check">
          <Row label="Double-Boxed?"><Choice name="Double-Boxed?" value={v.doubleBoxed} onChange={(x) => set("doubleBoxed", x)} options={YN} disabled={!editable} /></Row>
          <Row label="Bubble Wrap / Protective Material?"><Choice name="Protective material?" value={v.protectiveMaterial} onChange={(x) => set("protectiveMaterial", x)} options={YN} disabled={!editable} /></Row>
          <Row label="Sturdy Outer Box?"><Choice name="Sturdy outer box?" value={v.sturdyOuterBox} onChange={(x) => set("sturdyOuterBox", x)} options={YN} disabled={!editable} /></Row>
          <Row label="Products Properly Secured?"><Choice name="Products properly secured?" value={v.productsSecured} onChange={(x) => set("productsSecured", x)} options={YN} disabled={!editable} /></Row>
          <Row label="Package Properly Sealed?"><Choice name="Package properly sealed?" value={v.packageSealed} onChange={(x) => set("packageSealed", x)} options={YN} disabled={!editable} /></Row>
          <Row label="Packaging Requirements Met?">
            <Choice
              name="Packaging requirements met?"
              value={v.packagingRequirementsMet}
              onChange={(x) => set("packagingRequirementsMet", x)}
              options={[
                { value: "YES", label: "Yes", tone: "good" },
                { value: "PARTIALLY", label: "Partially", tone: "warn" },
                { value: "NO", label: "No", tone: "bad" },
              ]}
              disabled={!editable}
            />
          </Row>
          <Row label="Overall Packaging Condition">
            <Choice
              name="Overall packaging condition"
              value={v.overallPackaging}
              onChange={(x) => set("overallPackaging", x)}
              options={[
                { value: "ACCEPTABLE", label: "Acceptable", tone: "good" },
                { value: "NOT_ACCEPTABLE", label: "Not acceptable", tone: "bad" },
              ]}
              disabled={!editable}
            />
          </Row>
          {v.overallPackaging === "NOT_ACCEPTABLE" && (
            <>
              <Row label="Packaging Issue Notes">{textInput("packagingIssueNotes", 2)}</Row>
              <Row label="Packaging Issue Photos">{slot("PACKAGING_ISSUE")}</Row>
            </>
          )}
        </Step>

        {/* STEP 5 */}
        <Step n={5} id="step-5" title="Contents">
          <Row label="Photo - Complete Contents">{slot("COMPLETE_CONTENTS")}</Row>
          <Row label="Invoice / Packing Sheet Included?"><Choice name="Packing sheet included?" value={v.packingSheetIncluded} onChange={(x) => set("packingSheetIncluded", x)} options={YN} disabled={!editable} /></Row>
          {v.packingSheetIncluded === "YES" && <Row label="Invoice / Packing Sheet Photo">{slot("PACKING_SHEET")}</Row>}
          <Row label="Does Quantity Match What Was Quoted?"><Choice name="Quantity matches?" value={v.quantityMatches} onChange={(x) => set("quantityMatches", x)} options={YN} disabled={!editable} /></Row>
        </Step>

        {/* STEP 6 */}
        <Step n={6} id="step-6" title="Verify what arrived" note="Add a record for each product that arrived. Choose the product from the list (its NDC fills in), then enter the quantity, condition, lot number and expiration date.">
          <Row label="Items Quoted For This Order"><span className="whitespace-pre-line">{brief.itemsText}</span></Row>
          <Row label="Quotation / Invoice Photo (from Order)"><ReceiptPreview packageId={packageId} receipt={receipt} /></Row>
          <div role="tablist" aria-label="Step 6 sections" className="mt-6 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
            {([
              ["items", "Items received", ""],
              ["numbers", "Lot & serial numbers", serials.length ? ` (${serials.length})` : ""],
              ["scan", "Scan station", ""],
              ["recall", "Recall check", recallChecks.length ? ` (${recallChecks.length})` : ""],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`s6tab-${key}`}
                aria-selected={step6Tab === key}
                aria-controls={`s6panel-${key}`}
                onClick={() => setStep6Tab(key)}
                className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${step6Tab === key ? "border-slate-200 border-b-white bg-white text-slate-900 dark:border-slate-700 dark:border-b-slate-900 dark:bg-slate-900 dark:text-slate-50" : "border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                {label}
                {count}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="s6panel-items" aria-labelledby="s6tab-items" hidden={step6Tab !== "items"}>
          <ReceivedItemsGrid
            packageId={packageId}
            items={items}
            flags={flags}
            editable={editable}
            quotedLines={props.quotedLines}
            catalog={props.catalog}
            photos={photos}
            storageOk={storageOk}
            onError={setError}
            onPatchMany={patchMany}
            onRemoveMany={removeItems}
            recallStates={recallStates}
            onScanRow={editable ? setScanItemId : undefined}
            onNumbersRow={editable ? (id) => { setNumbersItemId(id); setStep6Tab("numbers"); } : undefined}
            numberCounts={Object.fromEntries(items.map((i) => { const n = numbersFor(serials, i.id); return [i.id, { lots: n.lots.length, serials: n.serials.length }]; }))}
          />

          </div>
          <div role="tabpanel" id="s6panel-numbers" aria-labelledby="s6tab-numbers" hidden={step6Tab !== "numbers"}>
            <NumbersTab
              packageId={packageId}
              items={items}
              editable={editable}
              serials={serials}
              onSerials={setSerials}
              onChecks={setRecallChecks}
              onPatchMany={patchMany}
              onError={setError}
              selectedId={numbersItemId}
              onSelect={setNumbersItemId}
            />
          </div>
          <div role="tabpanel" id="s6panel-scan" aria-labelledby="s6tab-scan" hidden={step6Tab !== "scan"}>
          <ScanStation
            packageId={packageId}
            items={items}
            editable={editable}
            photoReading={props.photoReading}
            serials={serials}
            onSerials={setSerials}
            onChecks={setRecallChecks}
            onPatchMany={patchMany}
            onError={setError}
          />

          </div>
          <div role="tabpanel" id="s6panel-recall" aria-labelledby="s6tab-recall" hidden={step6Tab !== "recall"}>
          <RecallCheck
            packageId={packageId}
            items={items}
            editable={editable}
            isAdminUser={props.isAdminUser}
            photoReading={props.photoReading}
            recalls={recalls}
            onRecalls={setRecalls}
            checks={recallChecks}
            onChecks={setRecallChecks}
            onPatchMany={patchMany}
            onError={setError}
            focus={recallFocus}
            onBack={() => setStep6Tab("items")}
          />
          </div>
          {scanItemId && items.find((i) => i.id === scanItemId) && (
            <RowScanDialog
              packageId={packageId}
              item={items.find((i) => i.id === scanItemId)!}
              recalls={recalls}
              photoReading={props.photoReading}
              onClose={() => setScanItemId(null)}
              onChecks={setRecallChecks}
              onPatchMany={patchMany}
              onError={setError}
            />
          )}

          <div className="mt-8">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Verification Summary</h3>
            <dl className="mt-3 text-sm">
              {[
                ["Total Product Lines", String(summary.lines)],
                ["Total Quantity", String(summary.quantityReceived)],
                ["Discrepancy Status", summary.anyDiscrepancy ? "Discrepancy" : "None"],
                ["Total Quantity To Be Returned", String(summary.quantityToReturn)],
                ["Recall Check", recalledNames.length ? `RECALLED: ${recalledNames.join(", ")}` : checkedCount ? `${checkedCount} product${checkedCount === 1 ? "" : "s"} checked, none on the lists we have` : "Not checked"],
                ["Units Scanned", serials.length ? `${serials.length} scanned${scanFlagged ? `, ${scanFlagged} flagged (repeated, made-up or wrong serial, recalled or expired)` : ", none flagged"}` : "None scanned"],
                ["Return Status Summary", summary.returnStatuses.length ? summary.returnStatuses.map((x) => RETURN_STATUS_LABELS[x as keyof typeof RETURN_STATUS_LABELS] ?? x).join(", ") : "—"],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,15rem)_1fr] gap-4 border-b border-slate-100 py-2.5 dark:border-slate-800/70">
                  <dt className="text-slate-700 dark:text-slate-200">{label}</dt>
                  <dd className={`font-medium tabular-nums ${label === "Discrepancy Status" ? (summary.anyDiscrepancy ? "text-orange-700 dark:text-orange-300" : "text-green-700 dark:text-green-400") : (label === "Recall Check" && recalledNames.length) || (label === "Units Scanned" && scanFlagged) ? "text-red-700 dark:text-red-300" : ""}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {unchecked.length > 0 && (
              <p role="status" className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
                Recall check not done yet for: {unchecked.join(", ")}. These products have recalls in progress. Check their lot or serial number above.
              </p>
            )}
            {notEntered.length > 0 && (
              <p role="status" className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
                Quoted but not entered as received: {notEntered.map((l) => l.name).join(", ")}. If it didn&apos;t arrive, that is a shortage and the order is marked with a discrepancy.
              </p>
            )}
            {missingLots.length > 0 && (
              <p role="status" className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
                Lot number missing on {missingLots.length === 1 ? "1 line" : `${missingLots.length} lines`}: {missingLots.join(", ")}. Supplies normally come with a lot number. Type it in the Lot Number column.
              </p>
            )}
          </div>
        </Step>

        {/* STEP 7 (receiving part) */}
        <Step n={7} id="step-7" title="Adjustments">
          <Row label="Adjustment Needed?"><Choice name="Adjustment needed?" value={v.adjustmentNeeded} onChange={(x) => set("adjustmentNeeded", x)} options={YN_RISK} disabled={!editable} /></Row>
          {v.adjustmentNeeded === "YES" && (
            <>
              <Row label="Adjustment Details">{textInput("adjustmentDetails", 3)}</Row>
              {items.length > 0 && (
                <div className="mt-3 space-y-3">
                  {items.map((it, idx) => it.productName.trim() ? (
                    <ItemAdjustmentCard key={it.id} item={it} flagged={flags[idx]} editable={editable} onChange={(patch) => patchMany({ [it.id]: patch })} />
                  ) : null)}
                </div>
              )}
            </>
          )}
        </Step>
      </fieldset>

      {/* STEP 7 (accounting part) */}
      <fieldset disabled={!canAccounts} className="min-w-0 border-0 p-0">
        <div className="mt-2">
          <AdjustmentSection
            packageId={packageId}
            view={props.adjustmentView}
            canWrite={canAccounts}
            beforeAction={saveBeforeAdjustment}
            onChanged={onAdjustmentChanged}
          />
          <Row label="Adjusted Order Total" hint="Leave blank to pay the original order total.">
            <input id="adjustedOrderTotal" inputMode="decimal" placeholder="0.00" className={`${field} sm:w-48`} value={v.adjustedOrderTotal} onChange={(e) => set("adjustedOrderTotal", e.target.value)} />
            {!adjustedValid && <p className="mt-1 text-xs text-red-700">Enter a dollar amount.</p>}
          </Row>
          <Row label="Final Payout">
            <span className="rounded-full bg-green-100 px-2.5 py-1 font-semibold tabular-nums text-green-900 dark:bg-green-900/40 dark:text-green-100">{formatMoney(payout)}</span>
            {adjustedNum != null && adjustedValid && <span className="ml-2 text-xs text-slate-500">was {formatMoney(total)}</span>}
          </Row>
          <Row label="Adjustment Amount (in the customer email)" hint="The dollar change the customer is told about, e.g. -30. Leave blank to use the difference between the totals.">
            <input id="adjustmentAmountEmail" inputMode="decimal" placeholder={suggestedChange != null ? String(suggestedChange) : "0.00"} className={`${field} sm:w-48`} value={v.adjustmentAmountEmail} onChange={(e) => set("adjustmentAmountEmail", e.target.value)} />
          </Row>
          <Row label="Revised Invoice / Adjustment Documentation">{slot("REVISED_INVOICE", { accounts: true })}</Row>
        </div>
      </fieldset>

      {/* STEP 8 */}
      <Step n={8} id="step-8" title="Customer note" note="Your own words for the customer. They are added to the email the customer receives.">
        <fieldset disabled={!canAccounts} className="min-w-0 border-0 p-0">
          <Row label="Notes for Customer Email">{textInput("customerEmailNote", 4)}</Row>
          <Row label="Notes for Customer Email - Photos">{slot("CUSTOMER_NOTE", { accounts: true })}</Row>
        </fieldset>
      </Step>

      {/* STEP 9 */}
      <Step n={9} id="step-9" title="Completion">
        <fieldset disabled={!editable} className="min-w-0 border-0 p-0">
          <Row label="Receiving Notes">{textInput("receivingNotes", 3)}</Row>
        </fieldset>
        <Row label="Receiving Completion Status">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_PILL[locked ? status : "IN_PROGRESS"]}`}>{STATUS_LABELS[locked ? status : "IN_PROGRESS"]}</span>
          {!locked && missing.length === 0 && <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">Ready to submit as: {STATUS_LABELS[finalStatus]}</span>}
        </Row>
        {!locked && (
          <Row label="Missing Info">
            {missing.length === 0 ? (
              <span className="font-medium text-green-700 dark:text-green-400">Nothing missing.</span>
            ) : (
              <ul className="list-disc space-y-0.5 pl-5 text-red-800 dark:text-red-300">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
          </Row>
        )}
        <fieldset disabled={!canAccounts} className="min-w-0 border-0 p-0">
          <Row label="Order Final Decision">
            <select id="accountsDecision" className={`${field} sm:w-72`} value={v.accountsDecision} onChange={(e) => set("accountsDecision", e.target.value)}>
              <option value="">Choose…</option>
              {Object.entries(ACCOUNTS_DECISION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Row>
        </fieldset>
      </Step>

      {/* STEP 10 */}
      <Step n={10} id="step-10" title="Accounts" highlight={accountsFocus ? "Accounts works here" : undefined}>
        {accountsFocus ? (
          <AccountsPayment
            packageId={packageId}
            photos={photos}
            storageOk={storageOk}
            canPayment={canPayment}
            decision={v.accountsDecision}
            paid={saved.accountsStatus === "PAID"}
            submitted={locked}
            paidAt={saved.paidAt}
            amount={payout}
            quoted={total}
            onError={setError}
          />
        ) : (
          <>
        <p role="note" className="mt-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          For Accounts purposes only. The Accounts team works in this step. Receiving: please don&apos;t change anything here.
        </p>
        <fieldset disabled={!canPayment} className="min-w-0 border-0 p-0">
          <Row label="Accounts Status">
            <select id="accountsStatus" className={`${field} sm:w-72`} value={v.accountsStatus} onChange={(e) => set("accountsStatus", e.target.value)}>
              <option value="">Choose…</option>
              {Object.entries(ACCOUNTS_STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Row>
          <Row label="Paid Date/Time">
            <span suppressHydrationWarning>{formatUtcStamp(saved.paidAt)}</span>
            <span className="ml-2 text-xs text-slate-500">Filled in automatically when the status is saved as Paid.</span>
          </Row>
          <Row label="Payment Confirmation Photo">{slot("PAYMENT_CONFIRMATION", { accounts: true, payment: true })}</Row>
        </fieldset>
          </>
        )}
        <Row label="Submitted By">{locked ? submittedBy ?? "—" : "—"}</Row>
        <Row label="Submission Date/Time">{locked ? <span suppressHydrationWarning>{formatUtcStamp(saved.submittedAt)}</span> : "—"}</Row>
        <Row label="Record Created"><span suppressHydrationWarning>{formatUtcStamp(saved.createdAt)}</span></Row>
      </Step>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {missingAfterSubmit && missingAfterSubmit.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 rounded-lg bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
          {missingAfterSubmit.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {message && <p role="status" className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{message}</p>}

      {(editable || canAccounts) && (
        <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap gap-3 border-t border-slate-200 bg-stone-50/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 dark:border-slate-800 dark:bg-slate-950/95">
          {editable ? (
            <>
              <button onClick={() => run("save")} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
                {pending ? "Working…" : locked ? "Save changes" : "Save draft"}
              </button>
              {!locked && <button onClick={() => run("submit")} disabled={pending || missing.length > 0} title={missing.length ? "Fill in everything listed under Missing Info first" : undefined} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
                Submit receiving
              </button>}
            </>
          ) : (
            <button onClick={() => run("accounts")} disabled={pending} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
              {pending ? "Working…" : "Save accounts changes"}
            </button>
          )}
        </div>
      )}
    </article>
    </PhotoAddContext.Provider>
  );
}
