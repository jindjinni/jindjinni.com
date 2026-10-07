"use client";

import { useState, useTransition } from "react";
import { updatePurchasingQuotationHeader } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function QuotationHeaderForm({
  quotationId,
  quotationDate,
  trackingNumber,
  carrier,
  packageStatus,
  deliveredDay,
  notes,
  children,
}: {
  quotationId: string;
  quotationDate: string;
  trackingNumber: string | null;
  carrier: string | null;
  packageStatus: string;
  /** The day it was delivered (the company's own calendar day), or "" when none is on file. */
  deliveredDay: string;
  notes: string | null;
  /** The live tracking, shown right under the tracking number. */
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  // The delivered day as it was when the form was opened: what the date box starts with, and what a save compares against.
  const [startDay, setStartDay] = useState(deliveredDay);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {new Date(quotationDate).toLocaleDateString()} · {packageStatus}
          {packageStatus === "Delivered" && deliveredDay
            ? ` ${deliveredDay}`
            : ""}
          {trackingNumber ? ` · Tracking ${trackingNumber}` : ""}{" "}
          <button
            type="button"
            onClick={() => {
              setStartDay(deliveredDay);
              setEditing(true);
            }}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Edit
          </button>
        </p>
        {children}
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setError("");
          // Stay open when the save is refused (for example a delivered date in the future), so the message is seen.
          startTransition(async () => {
            const res: ActionState = await updatePurchasingQuotationHeader(
              quotationId,
              undefined,
              formData,
            );
            if (res?.error) setError(res.error);
            else setEditing(false);
          });
        }}
        className="mt-2 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Quotation date
          </span>
          <input
            name="quotationDate"
            type="date"
            defaultValue={quotationDate.slice(0, 10)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Tracking number
          </span>
          <input
            name="trackingNumber"
            defaultValue={trackingNumber ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Carrier</span>
          <select
            name="carrier"
            defaultValue={carrier ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="UPS">UPS</option>
            <option value="USPS">USPS</option>
            <option value="FedEx">FedEx</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Package status
          </span>
          <select
            name="packageStatus"
            defaultValue={packageStatus}
            className={inputClass}
          >
            {[
              "Pre-Transit",
              "In Transit",
              "Out for Delivery",
              "Delivered",
              "Exception",
              "Returned",
              "Unknown",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Delivered on
          </span>
          <input type="hidden" name="deliveredOnWas" value={startDay} />
          <input
            name="deliveredOn"
            type="date"
            defaultValue={startDay}
            className={inputClass}
            title="Only used when the status is Delivered. It starts the clock on when the customer is paid."
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Notes</span>
          <input
            name="notes"
            defaultValue={notes ?? ""}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          Cancel
        </button>
        {error && (
          <p
            role="alert"
            data-testid="header-error"
            className="w-full text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </form>
      {children}
    </>
  );
}
