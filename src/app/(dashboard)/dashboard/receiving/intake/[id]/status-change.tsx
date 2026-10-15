"use client";

// Feature `receiving-status-change`: on a submitted shipment, say why it was flagged and let the Receiver / Admin / Owner
// change its status (Complete, Complete With Discrepancy, Needs To Be Reviewed). The server checks the role and the flag.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeReceivingStatus } from "@/app/actions/receiving";
import { STATUS_CHOICES, STATUS_LABELS } from "@/lib/receiving-rules";
import { STATUS_PILL } from "@/lib/receiving-ui";
import { field } from "./intake-parts";

export function StatusChange({ packageId, status, reasons, canChange }: { packageId: string; status: keyof typeof STATUS_LABELS; reasons: string[]; canChange: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<string>(status);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function save() {
    setError("");
    setDone("");
    start(async () => {
      const r = await changeReceivingStatus(packageId, pick, note);
      if (r.error) return setError(r.error);
      setDone(`Status is now ${STATUS_LABELS[pick as keyof typeof STATUS_LABELS]}.`);
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" data-status-change>
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Receiving status</h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[status]}`} data-status-now>{STATUS_LABELS[status]}</span>
        {status === "RECEIVING_COMPLETE_WITH_DISCREPANCY" && (
          <span className="ml-2">
            {reasons.length > 0 ? "It is flagged because:" : "Nothing flags this shipment today. The label was set when it was submitted, so you can change it."}
          </span>
        )}
      </p>
      {status === "RECEIVING_COMPLETE_WITH_DISCREPANCY" && reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-6 text-sm text-slate-700 dark:text-slate-200" data-status-reasons>
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {canChange && (
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] md:items-end">
          <div>
            <label htmlFor="status-pick" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change status to</label>
            <select id="status-pick" className={`${field} mt-1`} value={pick} onChange={(e) => setPick(e.target.value)} disabled={pending}>
              {STATUS_CHOICES.map((k) => (
                <option key={k} value={k}>{STATUS_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status-note" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note (optional)</label>
            <input id="status-note" className={`${field} mt-1`} value={note} maxLength={300} placeholder="Why you are changing it" onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </div>
          <button type="button" onClick={save} disabled={pending || pick === status} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300">
            {pending ? "Saving…" : "Change status"}
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Changing the status does not move the payment. Who changed it, and why, is kept in the order&apos;s history.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {done && <p role="status" className="mt-2 text-sm text-green-800 dark:text-green-300">{done}</p>}
    </section>
  );
}
