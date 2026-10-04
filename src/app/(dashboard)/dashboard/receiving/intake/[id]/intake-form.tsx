"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  saveReceiving,
  submitReceiving,
  reopenReceiving,
  uploadReceivingPhoto,
  deleteReceivingPhoto,
} from "@/app/actions/receiving";
import { prepareUploadFile } from "@/lib/client-image";
import type { PackagePhoto, QuotationBrief } from "@/lib/receiving-queries";
import {
  DAMAGE_TYPES,
  MAX_PHOTOS_PER_KIND,
  PHOTO_KIND_LABELS,
  STATUS_LABELS,
  computeMissingInfo,
  finalStatusFor,
  type PhotoKind,
} from "@/lib/receiving-rules";
import { MONEY, STATUS_PILL, chipClass, formatStamp } from "@/lib/receiving-ui";

type Values = {
  trackingNumber: string;
  carrier: string;
  receivedAt: string;
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
};

type Props = {
  packageId: string;
  status: keyof typeof STATUS_LABELS;
  canWrite: boolean;
  storageOk: boolean;
  brief: QuotationBrief;
  receipt: { present: boolean; isImage: boolean };
  receivedByName: string;
  submittedAt: string | null;
  photos: PackagePhoto[];
  initial: Values;
};

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800";

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5 border-b border-slate-100 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4 dark:border-slate-800/70">
      <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
        {label}
        {hint && <p className="mt-0.5 text-xs font-normal text-slate-500">{hint}</p>}
      </div>
      <div className="min-w-0 text-sm text-slate-900 dark:text-slate-50">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="border-b-2 border-[#F7B838] pb-1.5 text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">{title}</h2>
      {children}
    </section>
  );
}

function Choice({
  name,
  value,
  onChange,
  options,
  disabled,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; tone: "good" | "bad" | "warn" }[];
  disabled: boolean;
}) {
  const tones = {
    good: "peer-checked:bg-green-600 peer-checked:text-white",
    bad: "peer-checked:bg-red-600 peer-checked:text-white",
    warn: "peer-checked:bg-amber-500 peer-checked:text-white",
  };
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className={disabled ? "opacity-80" : "cursor-pointer"}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className="peer sr-only"
          />
          <span className={`inline-block rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${tones[o.tone]}`}>
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

const YN = [
  { value: "YES", label: "Yes", tone: "good" as const },
  { value: "NO", label: "No", tone: "bad" as const },
];
const YN_RISK = [
  { value: "YES", label: "Yes", tone: "bad" as const },
  { value: "NO", label: "No", tone: "good" as const },
];

function PhotoSlot({
  packageId,
  kind,
  photos,
  editable,
  storageOk,
  onError,
}: {
  packageId: string;
  kind: PhotoKind;
  photos: PackagePhoto[];
  editable: boolean;
  storageOk: boolean;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mine = photos.filter((p) => p.kind === kind);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    onError("");
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const prepared = await prepareUploadFile(file);
        if ("error" in prepared) {
          onError(prepared.error);
          break;
        }
        const fd = new FormData();
        fd.set("file", prepared);
        const res = await uploadReceivingPhoto(packageId, kind, fd);
        if (res.error) {
          onError(res.error);
          break;
        }
      }
    } catch {
      onError("Couldn't add that photo. Try again.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function remove(id: string) {
    onError("");
    startTransition(async () => {
      const res = await deleteReceivingPhoto(id);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {mine.map((p) => (
          <div key={p.id} className="group relative">
            <a href={`/api/receiving/photos/${p.id}`} target="_blank" rel="noreferrer" title={p.filename}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/receiving/photos/${p.id}`} alt={p.filename} loading="lazy" className="h-24 w-24 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
            </a>
            {editable && (
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label={`Remove ${p.filename}`}
                className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-slate-900 text-xs font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {mine.length === 0 && !editable && <span className="text-slate-500">No photo</span>}
        {editable && mine.length < MAX_PHOTOS_PER_KIND && (
          <label
            className={`flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center text-xs font-medium ${
              storageOk ? "cursor-pointer border-amber-400 text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40" : "cursor-not-allowed border-slate-300 text-slate-400"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden="true">{busy ? "…" : "+"}</span>
            {busy ? "Adding" : "Add photo"}
            <input
              ref={input}
              id={`photo-${kind}`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              capture={undefined}
              disabled={!storageOk || busy}
              className="sr-only"
              onChange={(e) => add(e.target.files)}
            />
          </label>
        )}
      </div>
      {editable && !storageOk && <p className="mt-1 text-xs text-slate-500">Photo storage isn&apos;t connected yet.</p>}
    </div>
  );
}

export function IntakeForm(props: Props) {
  const { packageId, status, canWrite, storageOk, brief, receipt, photos } = props;
  const router = useRouter();
  const [v, setV] = useState<Values>(props.initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [missingAfterSubmit, setMissingAfterSubmit] = useState<string[] | null>(null);

  const locked = status !== "IN_PROGRESS";
  const editable = canWrite && !locked;
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));

  const counts: Partial<Record<PhotoKind, number>> = {};
  for (const p of photos) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const facts = { ...v, receivedAt: v.receivedAt, damageTypes: v.damageTypes };
  const missing = computeMissingInfo(facts, counts);
  const finalStatus = finalStatusFor(facts);

  function toFormData() {
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) {
      if (Array.isArray(val)) val.forEach((x) => fd.append(k, x));
      else fd.set(k, val);
    }
    return fd;
  }

  function run(kind: "save" | "submit") {
    setError("");
    setMessage("");
    setMissingAfterSubmit(null);
    startTransition(async () => {
      const res = kind === "save" ? await saveReceiving(packageId, toFormData()) : await submitReceiving(packageId, toFormData());
      if (res.error) {
        setError(res.error);
        if (res.missing) setMissingAfterSubmit(res.missing);
        return;
      }
      setMessage(kind === "save" ? "Saved." : "Submitted. The order is now marked Received.");
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

  const slot = (kind: PhotoKind) => (
    <PhotoSlot packageId={packageId} kind={kind} photos={photos} editable={editable} storageOk={storageOk} onError={setError} />
  );

  return (
    <article className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50">
            {brief.customerName} — {brief.quotationNumber}
            {v.trackingNumber ? ` — ${v.trackingNumber}` : ""}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${chipClass(brief.customerName)}`}>{brief.customerName}</span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${STATUS_PILL[status]}`}>{STATUS_LABELS[status]}</span>
          </div>
        </div>
        {canWrite && locked && (
          <button onClick={reopen} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
            Reopen to edit
          </button>
        )}
      </header>
      {!canWrite && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Your role can view Receiving but can&apos;t make changes.</p>}

      <Section title="The order (from the Quotation Summary)">
        <Row label="Order Reference">{brief.quotationNumber}</Row>
        <Row label="Customer Name">{brief.customerName}</Row>
        <Row label="Customer Email / Phone">
          {[brief.email, brief.phone].filter(Boolean).join(" · ") || "—"}
        </Row>
        <Row label="Shipping Address"><span className="whitespace-pre-line">{brief.shippingAddress}</span></Row>
        <Row label="Order Date">{brief.quotationDate}</Row>
        <Row label="Order Total">
          <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium tabular-nums text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">{MONEY.format(brief.grandTotal)}</span>
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
      </Section>

      <fieldset disabled={!editable} className="min-w-0 border-0 p-0">
        <Section title="Arrival">
          <Row label="Order Tracking Number">
            <input id="trackingNumber" className={field} value={v.trackingNumber} maxLength={80} onChange={(e) => set("trackingNumber", e.target.value)} />
          </Row>
          <Row label="Carrier">
            <select id="carrier" className={field} value={v.carrier} onChange={(e) => set("carrier", e.target.value)}>
              <option value="">Choose…</option>
              {["UPS", "USPS", "FedEx", "Other"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Row>
          <Row label="Date/Time Received">
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="receivedAt"
                type="datetime-local"
                className={`${field} sm:w-auto`}
                value={v.receivedAt}
                onChange={(e) => set("receivedAt", e.target.value)}
              />
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
          <Row label="Received By">{props.receivedByName}</Row>
          <Row label="Photo - Unopened Package">{slot("UNOPENED_PACKAGE")}</Row>
          <Row label="Photo - Shipping Label">{slot("SHIPPING_LABEL")}</Row>
        </Section>

        <Section title="Condition on arrival">
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
              <Row label="Damage Notes">
                <textarea id="damageNotes" rows={2} className={field} value={v.damageNotes} onChange={(e) => set("damageNotes", e.target.value)} />
              </Row>
              <Row label="Damage Photos">{slot("DAMAGE")}</Row>
            </>
          )}
          <Row label="Photo - Package As Opened">{slot("PACKAGE_AS_OPENED")}</Row>
        </Section>

        <Section title="Packaging check">
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
              <Row label="Packaging Issue Notes">
                <textarea id="packagingIssueNotes" rows={2} className={field} value={v.packagingIssueNotes} onChange={(e) => set("packagingIssueNotes", e.target.value)} />
              </Row>
              <Row label="Packaging Issue Photos">{slot("PACKAGING_ISSUE")}</Row>
            </>
          )}
        </Section>

        <Section title="Contents">
          <Row label="Photo - Complete Contents">{slot("COMPLETE_CONTENTS")}</Row>
          <Row label="Invoice / Packing Sheet Included?"><Choice name="Packing sheet included?" value={v.packingSheetIncluded} onChange={(x) => set("packingSheetIncluded", x)} options={YN} disabled={!editable} /></Row>
          {v.packingSheetIncluded === "YES" && <Row label="Invoice / Packing Sheet Photo">{slot("PACKING_SHEET")}</Row>}
          <Row label="Does Quantity Match What Was Quoted?"><Choice name="Quantity matches?" value={v.quantityMatches} onChange={(x) => set("quantityMatches", x)} options={YN} disabled={!editable} /></Row>
          <Row label="Adjustment Needed?"><Choice name="Adjustment needed?" value={v.adjustmentNeeded} onChange={(x) => set("adjustmentNeeded", x)} options={YN_RISK} disabled={!editable} /></Row>
          {v.adjustmentNeeded === "YES" && (
            <Row label="Adjustment Details">
              <textarea id="adjustmentDetails" rows={3} className={field} value={v.adjustmentDetails} onChange={(e) => set("adjustmentDetails", e.target.value)} />
            </Row>
          )}
          <Row label="Receiving Notes">
            <textarea id="receivingNotes" rows={3} className={field} value={v.receivingNotes} onChange={(e) => set("receivingNotes", e.target.value)} />
          </Row>
        </Section>
      </fieldset>

      <Section title="Completion">
        <Row label="Receiving Completion Status">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_PILL[locked ? status : "IN_PROGRESS"]}`}>
            {STATUS_LABELS[locked ? status : "IN_PROGRESS"]}
          </span>
          {!locked && missing.length === 0 && (
            <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">Ready to submit as: {STATUS_LABELS[finalStatus]}</span>
          )}
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
        {locked && <Row label="Submission Date/Time">{formatStamp(props.submittedAt)}</Row>}
      </Section>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{message}</p>}

      {editable && (
        <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap gap-3 border-t border-slate-200 bg-stone-50/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 dark:border-slate-800 dark:bg-slate-950/95">
          <button onClick={() => run("save")} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
            {pending ? "Working…" : "Save draft"}
          </button>
          <button onClick={() => run("submit")} disabled={pending || missing.length > 0} title={missing.length ? "Fill in everything listed under Missing Info first" : undefined} className="rounded-lg bg-[#F7B838] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
            Submit receiving
          </button>
        </div>
      )}
    </article>
  );
}
