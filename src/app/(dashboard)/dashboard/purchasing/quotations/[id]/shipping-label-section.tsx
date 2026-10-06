"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { generatePurchasingShippingLabel } from "@/app/actions/purchasing";
import { CARRIER_NAME, MAX_LABELS_PER_ORDER, trackingMessage, type LabelCarrier, type StoredLabelCarrier } from "@/lib/shipping-labels";

export type SavedLabel = {
  id: string;
  labelNumber: number;
  carrier: StoredLabelCarrier;
  labelUrl: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

type ActionState = { error?: string; remaining?: number } | undefined;

/** Copies the tracking link and flashes "Copied!" so the agent knows the paste will work before they switch over to a text/email to the customer. */
function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (e.g. insecure context) -- the link
      // text itself is still selectable, so this is a soft failure.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function ShippingLabelSection({
  quotationId,
  customerId,
  parcelLengthIn,
  parcelWidthIn,
  parcelHeightIn,
  parcelWeightLb,
  labels,
  labelStatus,
  labelError,
  hasOrgAddress,
  hasCustomerAddr,
}: {
  quotationId: string;
  customerId: string;
  parcelLengthIn: number;
  parcelWidthIn: number;
  parcelHeightIn: number;
  parcelWeightLb: number;
  labels: SavedLabel[];
  labelStatus: "NOT_GENERATED" | "GENERATED" | "ERROR";
  labelError: string | null;
  hasOrgAddress: boolean;
  hasCustomerAddr: boolean;
}) {
  // The service and the number of labels are kept in state (not left to the
  // form) because a form clears itself after it is sent -- the service must
  // not silently flip back to UPS after a USPS attempt that needs a retry.
  const [carrier, setCarrier] = useState<LabelCarrier>("UPS_GROUND");
  const [count, setCount] = useState("1");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await generatePurchasingShippingLabel(quotationId, prev, formData);
    // Done: back to one label, so the next press can't buy the same batch twice by accident.
    // Partly done: set the box to exactly how many are still missing.
    if (!result?.error) setCount("1");
    else if (result.remaining) setCount(String(result.remaining));
    return result;
  }, undefined);

  const blocked = !hasOrgAddress || !hasCustomerAddr;
  const parsed = Number(count);
  const countOk = count.trim() === "" || (Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_LABELS_PER_ORDER);
  const n = count.trim() === "" ? 1 : parsed;
  const hasLabels = labels.length > 0;

  return (
    <div id="shipping" className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Shipping label</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Free label for the customer to ship their items to us -- generated through Shippo once their address is on file.
        It always ships <span className="font-medium">from the customer</span> <span className="font-medium">to our receiving address</span> on file.
      </p>

      {!hasOrgAddress && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          Add your business&apos;s receiving address in{" "}
          <Link href="/dashboard/settings/business" className="font-medium hover:underline">
            Settings → Business
          </Link>{" "}
          before generating a label.
        </p>
      )}
      {hasOrgAddress && !hasCustomerAddr && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          This customer doesn&apos;t have a shipping address yet. Once they provide one, add it on their{" "}
          <Link href={`/dashboard/purchasing/customers/${customerId}`} className="font-medium hover:underline">
            customer page
          </Link>{" "}
          and come back here to generate the label.
        </p>
      )}

      {hasLabels ? (
        <div data-testid="saved-labels" className="mt-4 rounded-md bg-emerald-50 p-4 text-sm dark:bg-emerald-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {labels.length === 1 ? "Label ready" : `${labels.length} labels ready`} -- saved to this quotation
            </span>
            {labels.length > 1 && trackingMessage(labels) && (
              <CopyLinkButton url={trackingMessage(labels)} label="Copy all tracking links" />
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {labels.map((l) => (
              <li
                key={l.id}
                data-testid="saved-label"
                className="rounded-md border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-900 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-3">
                  {labels.length > 1 && (
                    <span className="font-medium text-slate-800 dark:text-slate-100">Label {l.labelNumber}</span>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400">{CARRIER_NAME[l.carrier]}</span>
                  <a href={l.labelUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">
                    Open / print label
                  </a>
                  {l.trackingNumber && (
                    <span className="text-slate-700 dark:text-slate-300">Tracking: {l.trackingNumber}</span>
                  )}
                </div>
                {l.trackingUrl && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Tracking link -- send to customer
                    </span>
                    <a
                      href={l.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-emerald-700 underline dark:text-emerald-400"
                    >
                      {l.trackingUrl}
                    </a>
                    <CopyLinkButton url={l.trackingUrl} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        labelStatus === "ERROR" &&
        labelError && (
          <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {labelError}
          </p>
        )
      )}

      {/* Sent by hand (not <form action>) so React doesn't clear the service and
          label count after every attempt -- a USPS retry must stay USPS. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="mt-4 text-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">Service</span>
            <select
              name="labelCarrier"
              // UPS Ground is always the default, regardless of what's
              // stored from a prior attempt -- USPS stays one click away
              // for whoever wants it.
              value={carrier}
              onChange={(e) => setCarrier(e.target.value === "USPS_PRIORITY" ? "USPS_PRIORITY" : "UPS_GROUND")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="UPS_GROUND">UPS Ground</option>
              <option value="USPS_PRIORITY">USPS Priority Mail</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">How many labels?</span>
            <input
              id="labelCount"
              name="labelCount"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_LABELS_PER_ORDER}
              step="1"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            disabled={pending || blocked || !countOk}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {!countOk
              ? `Enter 1 to ${MAX_LABELS_PER_ORDER} labels`
              : pending
              ? n === 1
                ? "Generating..."
                : `Generating ${n} labels...`
              : hasLabels
                ? `Add ${n} more label${n === 1 ? "" : "s"}`
                : n === 1
                  ? "Generate shipping label"
                  : `Generate ${n} shipping labels`}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Usually one label. If the customer is sending several boxes, enter how many -- each gets its own label and
          tracking number, all saved to this quotation (up to {MAX_LABELS_PER_ORDER} at a time).
          {hasLabels && " Existing labels are kept; new ones are added after them."}
        </p>

        {/* Package size defaults to a standard 10x10x10in / 3lb box -- tucked
            away so generating a label is just "pick a carrier, go." */}
        <details className="mt-3 text-slate-500 dark:text-slate-400">
          <summary className="w-fit cursor-pointer select-none text-xs font-medium hover:text-slate-700 dark:hover:text-slate-200">
            Package size (optional -- defaults to 10×10×10in, 3lb)
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-slate-600 dark:text-slate-400">L × W × H (in)</span>
              <span className="flex gap-1">
                <input
                  name="parcelLengthIn"
                  type="number"
                  min="1"
                  step="0.1"
                  defaultValue={parcelLengthIn}
                  className="w-16 rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  name="parcelWidthIn"
                  type="number"
                  min="1"
                  step="0.1"
                  defaultValue={parcelWidthIn}
                  className="w-16 rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  name="parcelHeightIn"
                  type="number"
                  min="1"
                  step="0.1"
                  defaultValue={parcelHeightIn}
                  className="w-16 rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-600 dark:text-slate-400">Weight (lb)</span>
              <input
                name="parcelWeightLb"
                type="number"
                min="0.1"
                step="0.1"
                defaultValue={parcelWeightLb}
                className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>
        </details>
      </form>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
