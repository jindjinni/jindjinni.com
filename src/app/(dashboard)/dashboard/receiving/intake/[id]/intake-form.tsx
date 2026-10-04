"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addReceivingItem,
  deleteReceivingItem,
  reopenReceiving,
  saveFollowUp,
  saveReceiving,
  searchProductsForReceiving,
  sendCustomerNotification,
  sendPackagingWarning,
  submitReceiving,
} from "@/app/actions/receiving";
import type { PackagePhoto, QuotationBrief, ItemView, TeamMember } from "@/lib/receiving-queries";
import {
  ACCOUNTS_DECISION_LABELS,
  ACCOUNTS_STATUS_LABELS,
  DAMAGE_TYPES,
  STATUS_LABELS,
  adjustmentToolLink,
  computeMissingInfo,
  finalPayout,
  finalStatusFor,
  formatMoney,
  pickEmailTemplate,
  summarizeItems,
  RETURN_STATUS_LABELS,
  type EmailTemplateKey,
  type PhotoKind,
} from "@/lib/receiving-rules";
import { MONEY, STATUS_PILL, chipClass, formatUtcStamp } from "@/lib/receiving-ui";
import { Choice, PhotoSlot, Row, Step, YN, YN_RISK, field } from "./intake-parts";
import { ItemAdjustmentCard, ItemVerifyCard, itemFactsOf, toItemState, type ItemState } from "./item-card";

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
  isAdminUser: boolean;
  storageOk: boolean;
  brief: QuotationBrief;
  receipt: { present: boolean; isImage: boolean };
  tracking: { packageStatus: string | null; lastUpdate: string | null; deliveredAt: string | null };
  team: TeamMember[];
  duplicates: { number: string; tracking: string | null }[];
  settings: { emailsEnabled: boolean };
  photos: PackagePhoto[];
  items: ItemView[];
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
];

const TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  STANDARD: "Standard: package received & processed",
  STANDARD_PACKAGING_NOTICE: "Processed, with a packaging notice",
  ADJUSTMENT_ONLY: "Processed, with an adjustment",
  ADJUSTMENT_PACKAGING: "Processed, with an adjustment and a packaging notice",
};

const fieldKeysForAccounts = ["adjustedOrderTotal", "adjustmentAmountEmail", "customerEmailNote", "accountsDecision", "accountsStatus"] as const;

function AddProduct({ packageId, disabled, onError }: { packageId: string; disabled: boolean; onError: (m: string) => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; ndc: string | null; productCode: string | null }[]>([]);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (term.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchProductsForReceiving(term).then((r) => {
        if (live) setResults(r);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);

  function add(input: { productId?: string; name?: string }) {
    onError("");
    startTransition(async () => {
      const res = await addReceivingItem(packageId, input);
      if (res.error) onError(res.error);
      else {
        setTerm("");
        setResults([]);
        router.refresh();
      }
    });
  }
  const shown = term.trim().length < 2 ? [] : results;

  return (
    <div className="rounded-xl border border-dashed border-amber-400 p-4">
      <label htmlFor="add-product" className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Something arrived that wasn&apos;t on the order?
      </label>
      <input
        id="add-product"
        className={`${field} mt-2`}
        placeholder="Search your product list by name, code or NDC…"
        value={term}
        disabled={disabled || busy}
        onChange={(e) => setTerm(e.target.value)}
      />
      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={busy} onClick={() => add({ productId: p.id })} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-950/30">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{[p.productCode, p.ndc && `NDC ${p.ndc}`].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {term.trim().length >= 2 && (
        <button type="button" disabled={busy} onClick={() => add({ name: term })} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
          Add &ldquo;{term.trim()}&rdquo; as typed
        </button>
      )}
    </div>
  );
}

export function IntakeForm(props: Props) {
  const { packageId, status, canWrite, canAccounts, storageOk, brief, receipt, photos, saved } = props;
  const router = useRouter();
  const [v, setV] = useState<FormValues>(props.initial);
  const [edits, setEdits] = useState<Record<string, ItemState>>({});
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [missingAfterSubmit, setMissingAfterSubmit] = useState<string[] | null>(null);

  const locked = status !== "IN_PROGRESS";
  const editable = canWrite && !locked;
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  // Product lines: the server's list, with whatever the agent has typed over the top.
  const items: ItemState[] = props.items.map((pi) => edits[pi.id] ?? toItemState(pi));
  function patchItem(id: string, patch: Partial<ItemState>) {
    const base = items.find((i) => i.id === id);
    if (!base) return;
    setEdits((e) => ({ ...e, [id]: { ...base, ...patch } }));
  }

  const counts: Partial<Record<PhotoKind, number>> = {};
  for (const p of photos) if (!p.itemId) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const itemFacts = items.map(itemFactsOf);
  const facts = { ...v };
  const missing = computeMissingInfo(facts, counts, itemFacts);
  const finalStatus = finalStatusFor(facts, itemFacts);
  const summary = summarizeItems(itemFacts);

  const total = brief.grandTotal;
  const adjustedNum = v.adjustedOrderTotal.trim() === "" ? null : Number(v.adjustedOrderTotal.replace(/[$,\s]/g, ""));
  const adjustedValid = adjustedNum == null || Number.isFinite(adjustedNum);
  const payout = finalPayout(total, adjustedValid ? adjustedNum : null);
  const suggestedChange = adjustedValid && adjustedNum != null ? Math.round((adjustedNum - total) * 100) / 100 : null;
  const template = pickEmailTemplate({ adjustmentNeeded: v.adjustmentNeeded, overallPackaging: v.overallPackaging });
  const firstReason = items.find((i) => i.adjustmentReason)?.adjustmentReason ?? null;
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
      const base = kind === "submit" ? "Submitted. The order is now marked Received." : "Saved.";
      setMessage(res.notice ? `${base} ${res.notice}` : base);
      router.refresh();
    });
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

  function removeItem(id: string) {
    if (!window.confirm("Remove this product line and its photos?")) return;
    setError("");
    startTransition(async () => {
      const res = await deleteReceivingItem(packageId, id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function notify(kind: "status" | "warning") {
    setError("");
    setMessage("");
    startTransition(async () => {
      const res = kind === "status" ? await sendCustomerNotification(packageId) : await sendPackagingWarning(packageId);
      if (res.error) setError(res.error);
      else {
        setMessage(res.notice ?? "Sent.");
        router.refresh();
      }
    });
  }

  const slot = (kind: PhotoKind, opts?: { accounts?: boolean }) => (
    <PhotoSlot packageId={packageId} kind={kind} photos={photos} editable={opts?.accounts ? canAccounts : editable} storageOk={storageOk} onError={setError} />
  );
  const textInput = (id: keyof FormValues, rows?: number) =>
    rows ? (
      <textarea id={id} rows={rows} className={field} value={v[id] as string} onChange={(e) => set(id, e.target.value as never)} />
    ) : (
      <input id={id} className={field} value={v[id] as string} onChange={(e) => set(id, e.target.value as never)} />
    );

  const canSendStatus = canAccounts && locked && saved.accountsStatus === "PAID" && props.settings.emailsEnabled && !!brief.email;

  return (
    <article className="mx-auto max-w-4xl">
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
      {!canWrite && !canAccounts && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Your role can view Receiving but can&apos;t make changes.</p>}
      {props.duplicates.length > 0 && (
        <p role="status" className="mt-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
          Possible duplicate order: another order has the same reference or tracking number ({props.duplicates.map((d) => d.number).join(", ")}). Check before paying.
        </p>
      )}

      <nav aria-label="Steps" className="sticky top-0 z-10 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-stone-50/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8 dark:border-slate-800 dark:bg-slate-950/95">
        {STEPS.map((s, i) => (
          <a key={s} href={`#step-${i + 1}`} className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-amber-950/30">
            <span className="font-bold text-amber-800 dark:text-amber-300">{i + 1}</span> {s}
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
          {receipt.present ? (
            <div className="space-y-2">
              {receipt.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/receiving/packages/${packageId}/quotation-receipt`} alt="Quotation receipt" className="max-h-80 max-w-full rounded-lg border border-slate-200 dark:border-slate-700" />
              ) : (
                <iframe title="Quotation receipt" src={`/api/receiving/packages/${packageId}/quotation-receipt`} className="h-96 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
              )}
              <a href={`/api/receiving/packages/${packageId}/quotation-receipt`} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-amber-800 underline dark:text-amber-300">
                Open in a new tab
              </a>
            </div>
          ) : (
            <span className="text-slate-500">No receipt on file</span>
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
        <Step n={6} id="step-6" title="Verify what arrived" note="One card per product. Enter what you counted, the lot number and NDC printed on the product, and its expiration date. Everything here is saved with the shipment.">
          <div className="mt-3 space-y-4">
            {items.length === 0 && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">No product lines yet. Add what arrived below.</p>}
            {items.map((it) => (
              <ItemVerifyCard
                key={it.id}
                item={it}
                editable={editable}
                packageId={packageId}
                photos={photos}
                storageOk={storageOk}
                onError={setError}
                onChange={(patch) => patchItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
              />
            ))}
            {editable && <AddProduct packageId={packageId} disabled={!editable} onError={setError} />}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Verification Summary</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">Product lines</dt><dd className="text-lg font-semibold tabular-nums">{summary.lines}</dd></div>
              <div><dt className="text-xs text-slate-500">Quantity received</dt><dd className="text-lg font-semibold tabular-nums">{summary.quantityReceived}</dd></div>
              <div>
                <dt className="text-xs text-slate-500">Any discrepancy?</dt>
                <dd className={`text-lg font-semibold ${summary.anyDiscrepancy ? "text-orange-700 dark:text-orange-300" : "text-green-700 dark:text-green-400"}`}>{summary.anyDiscrepancy ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">To return</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {summary.quantityToReturn}
                  {summary.returnStatuses.length > 0 && <span className="ml-2 text-xs font-normal text-slate-500">{summary.returnStatuses.map((s) => RETURN_STATUS_LABELS[s as keyof typeof RETURN_STATUS_LABELS] ?? s).join(", ")}</span>}
                </dd>
              </div>
            </dl>
          </div>
        </Step>

        {/* STEP 7 (receiving part) */}
        <Step n={7} id="step-7" title="Adjustments">
          <Row label="Adjustment Needed?"><Choice name="Adjustment needed?" value={v.adjustmentNeeded} onChange={(x) => set("adjustmentNeeded", x)} options={YN_RISK} disabled={!editable} /></Row>
          {v.adjustmentNeeded === "YES" && (
            <>
              <Row label="Adjustment Details">{textInput("adjustmentDetails", 3)}</Row>
              <Row label="Adjusted Quotation">
                <a
                  href={adjustmentToolLink(brief.customerName, brief.quotationNumber, v.trackingNumber || null, firstReason)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-lg bg-[#F7B838] px-3 py-2 text-sm font-semibold text-amber-950 hover:brightness-95"
                >
                  Generate adjustment quotation
                </a>
                <p className="mt-1 text-xs text-slate-500">Opens the adjustment tool in a new tab. Upload the revised invoice below when you have it.</p>
              </Row>
              {items.length > 0 && (
                <div className="mt-3 space-y-3">
                  {items.map((it) => (
                    <ItemAdjustmentCard key={it.id} item={it} editable={editable} onChange={(patch) => patchItem(it.id, patch)} />
                  ))}
                </div>
              )}
            </>
          )}
        </Step>
      </fieldset>

      {/* STEP 7 (accounting part) */}
      <fieldset disabled={!canAccounts} className="min-w-0 border-0 p-0">
        <div className="mt-2">
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
      <Step n={9} id="step-9" title="Completion and accounts">
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
          <Row label="Accounts Decision">
            <select id="accountsDecision" className={`${field} sm:w-72`} value={v.accountsDecision} onChange={(e) => set("accountsDecision", e.target.value)}>
              <option value="">Choose…</option>
              {Object.entries(ACCOUNTS_DECISION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Row>
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
          <Row label="Payment Confirmation Photo">{slot("PAYMENT_CONFIRMATION", { accounts: true })}</Row>
        </fieldset>
        <Row label="Submitted By">{locked ? submittedBy ?? "—" : "—"}</Row>
        <Row label="Submission Date/Time">{locked ? <span suppressHydrationWarning>{formatUtcStamp(saved.submittedAt)}</span> : "—"}</Row>
        <Row label="Record Created"><span suppressHydrationWarning>{formatUtcStamp(saved.createdAt)}</span></Row>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Customer notification</h3>
          <p className="mt-1 text-xs text-slate-500">Email that applies to this shipment: {TEMPLATE_LABELS[template]}.</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Customer emailed</dt><dd>{saved.customerNotifiedAt ? <span suppressHydrationWarning>{formatUtcStamp(saved.customerNotifiedAt)}</span> : "Not yet"}</dd></div>
            <div><dt className="text-xs text-slate-500">Packaging warning sent</dt><dd>{saved.packagingWarningSentAt ? <span suppressHydrationWarning>{formatUtcStamp(saved.packagingWarningSentAt)}</span> : "Not yet"}</dd></div>
          </dl>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-amber-600" disabled={!canAccounts} checked={v.customerTexted} onChange={(e) => set("customerTexted", e.target.checked)} />
            Customer texted
          </label>
          {!props.settings.emailsEnabled && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              Customer emails are turned off.{" "}
              {props.isAdminUser ? <Link href="/dashboard/receiving/email-settings" className="font-semibold underline">Turn them on in Email Settings</Link> : "An admin can turn them on in Email Settings."}
            </p>
          )}
          {!brief.email && <p className="mt-3 text-xs text-red-800 dark:text-red-300">This order has no customer email address, so nothing can be sent.</p>}
          {canAccounts && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={pending || !canSendStatus} onClick={() => notify("status")} title={canSendStatus ? undefined : "Submit receiving, save the status as Paid and turn emails on first"} className="rounded-lg bg-[#F7B838] px-3 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
                {saved.customerNotifiedAt ? "Resend customer email" : "Send customer email"}
              </button>
              <button type="button" disabled={pending || !props.settings.emailsEnabled || !brief.email} onClick={() => notify("warning")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
                Send packaging warning
              </button>
            </div>
          )}
        </div>
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
                {pending ? "Working…" : "Save draft"}
              </button>
              <button onClick={() => run("submit")} disabled={pending || missing.length > 0} title={missing.length ? "Fill in everything listed under Missing Info first" : undefined} className="rounded-lg bg-[#F7B838] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
                Submit receiving
              </button>
            </>
          ) : (
            <button onClick={() => run("accounts")} disabled={pending} className="rounded-lg bg-[#F7B838] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
              {pending ? "Working…" : "Save accounts changes"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
