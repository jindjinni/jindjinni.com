"use client";

import { useActionState } from "react";
import Link from "next/link";
import { generatePurchasingShippingLabel } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

export function ShippingLabelSection({
  quotationId,
  customerId,
  labelCarrier,
  parcelLengthIn,
  parcelWidthIn,
  parcelHeightIn,
  parcelWeightLb,
  labelStatus,
  labelUrl,
  labelTrackingNumber,
  labelTrackingUrl,
  labelError,
  hasOrgAddress,
  hasCustomerAddr,
}: {
  quotationId: string;
  customerId: string;
  labelCarrier: "UPS_GROUND" | "USPS_GROUND";
  parcelLengthIn: number;
  parcelWidthIn: number;
  parcelHeightIn: number;
  parcelWeightLb: number;
  labelStatus: "NOT_GENERATED" | "GENERATED" | "ERROR";
  labelUrl: string | null;
  labelTrackingNumber: string | null;
  labelTrackingUrl: string | null;
  labelError: string | null;
  hasOrgAddress: boolean;
  hasCustomerAddr: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    generatePurchasingShippingLabel.bind(null, quotationId),
    undefined,
  );

  const blocked = !hasOrgAddress || !hasCustomerAddr;

  return (
    <div id="shipping" className="mt-8 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Shipping label</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Free outbound label for the customer -- generated through Shippo once their shipping details are on file.
      </p>

      {!hasOrgAddress && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          Add your business&apos;s ship-from address in{" "}
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

      {labelStatus === "GENERATED" && labelUrl ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Label ready</span>
          <a href={labelUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">
            Open / print label
          </a>
          {labelTrackingNumber && (
            <span className="text-slate-700 dark:text-slate-300">
              Tracking:{" "}
              {labelTrackingUrl ? (
                <a href={labelTrackingUrl} target="_blank" rel="noreferrer" className="underline">
                  {labelTrackingNumber}
                </a>
              ) : (
                labelTrackingNumber
              )}
            </span>
          )}
        </div>
      ) : (
        labelStatus === "ERROR" &&
        labelError && (
          <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {labelError}
          </p>
        )
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-slate-600 dark:text-slate-400">Service</span>
          <select
            name="labelCarrier"
            defaultValue={labelCarrier}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="UPS_GROUND">UPS Ground</option>
            <option value="USPS_GROUND">USPS Ground</option>
          </select>
        </label>
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
        <button
          type="submit"
          disabled={pending || blocked}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Generating..." : labelStatus === "GENERATED" ? "Regenerate label" : "Generate shipping label"}
        </button>
      </form>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
