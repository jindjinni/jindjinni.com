"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addManualTracking, refreshQuotationTracking, removeManualTracking } from "@/app/actions/tracking";
import { carrierTrackingLink, pillClass, type TrackEvent } from "@/lib/tracking-rules";
import { formatUtcStamp } from "@/lib/receiving-ui";

export type TrackerView = {
  id: string;
  carrier: string;
  trackingNumber: string;
  status: string;
  statusDetails: string | null;
  location: string | null;
  eta: string | null;
  statusAt: string | null;
  deliveredAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  history: TrackEvent[];
  /** The link Shippo gave when the label was bought, when there is one. */
  trackingUrl: string | null;
  /** "Label 2" when the number came from a label. */
  labelName: string | null;
  /** True for a number a manager typed in by hand. */
  manual: boolean;
  /** What the manager noted when adding it (for example where the label was made). */
  note: string | null;
};

const ago = (stamp: string | null) => {
  if (!stamp) return "not checked yet";
  const t = Date.parse(stamp.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "not checked yet";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

/**
 * The live tracking of a quotation's packages, right under its tracking number: one status pill for the order
 * (with "2 of 3 delivered" when there are several boxes) and a Details button that opens each box's progress.
 * It asks Shippo for the latest by itself when the order is opened and the news is old.
 */
export function TrackingPanel({
  quotationId,
  trackers,
  summary,
  hasNumber,
  needsRefresh,
  canAdd,
}: {
  quotationId: string;
  trackers: TrackerView[];
  summary: { status: string; delivered: number; total: number } | null;
  hasNumber: boolean;
  needsRefresh: boolean;
  /** Admins, the owner and Purchasing managers may add or remove a tracking number by hand. */
  canAdd: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const attempts = useRef(0);
  const [num, setNum] = useState("");
  const [carrier, setCarrier] = useState("auto");
  const [note, setNote] = useState("");
  const [added, setAdded] = useState("");
  const [asking, setAsking] = useState<string | null>(null);

  function add() {
    setError("");
    setAdded("");
    startTransition(async () => {
      const res = await addManualTracking(quotationId, { trackingNumber: num, carrier, note });
      if (res.error) setError(res.error);
      else {
        setNum("");
        setNote("");
        setCarrier("auto");
        setAdded("Added. It is saved on this order.");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    setError("");
    startTransition(async () => {
      const res = await removeManualTracking(quotationId, id);
      setAsking(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function refresh(force: boolean) {
    setError("");
    startTransition(async () => {
      const res = await refreshQuotationTracking(quotationId, force);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  useEffect(() => {
    if (!needsRefresh) return;
    // Asking Shippo is slow, so it happens after the page is already showing. At most twice per visit, so a
    // problem on Shippo's side can never turn into a loop.
    const t = setTimeout(() => {
      if (attempts.current >= 2) return;
      attempts.current += 1;
      refresh(false);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRefresh]);

  if (!hasNumber && trackers.length === 0 && !canAdd) return null;
  const none = !hasNumber && trackers.length === 0;

  const multi = summary && summary.total > 1;
  return (
    <div className="mt-1.5" data-testid="tracking-panel">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {none ? (
          <span className="text-xs text-slate-600 dark:text-slate-300" data-testid="tracking-none">No tracking number yet.</span>
        ) : summary ? (
          <span data-testid="tracking-status" className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillClass(summary.status)}`}>
            {summary.status}
          </span>
        ) : (
          <span data-testid="tracking-status" className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-800 dark:bg-stone-800 dark:text-stone-100">
            {pending ? "Checking…" : "Not tracked yet"}
          </span>
        )}
        {multi && (
          <span className="text-xs text-slate-600 dark:text-slate-300" data-testid="tracking-boxes">
            {summary!.delivered} of {summary!.total} boxes delivered
          </span>
        )}
        <button type="button" data-testid="tracking-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          {open ? (none ? "Close" : "Hide tracking") : none ? "Add a tracking number" : "Tracking details"}
        </button>
        {pending && <span className="text-xs text-slate-500" role="status">Checking with Shippo…</span>}
      </div>

      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900" data-testid="tracking-details">
          {trackers.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-300">No package is being tracked yet. {canAdd ? "Add a tracking number below, or buy a label." : "A Purchasing Manager or Admin can add a tracking number."}</p>}
          {trackers.map((t) => {
            const link = t.trackingUrl || carrierTrackingLink(t.carrier, t.trackingNumber);
            return (
              <div key={t.id} data-testid="tracker" className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  {t.labelName && <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{t.labelName}</span>}
                  {t.manual && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200" data-testid="tracker-manual">Added by hand</span>}
                  <span className="text-xs text-slate-500">{t.carrier}</span>
                  <span className="font-mono text-sm text-slate-800 dark:text-slate-100" data-testid="tracker-number">{t.trackingNumber}</span>
                  <span data-testid="tracker-status" className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pillClass(t.status)}`}>{t.status}</span>
                </div>
                {t.status === "Delivered" ? (
                  <p className="mt-2 text-sm text-slate-800 dark:text-slate-100" data-testid="tracker-delivered">
                    Delivered{" "}
                    <strong suppressHydrationWarning>{formatUtcStamp(t.deliveredAt ?? t.statusAt)}</strong> by {t.carrier}
                    {t.location ? ` in ${t.location}` : ""}.
                    {t.statusDetails ? <span className="block text-slate-600 dark:text-slate-300">{t.statusDetails}</span> : null}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-800 dark:text-slate-100" data-testid="tracker-now">
                    {t.statusDetails ?? "Waiting for the carrier's first scan."}
                    {t.location ? <span className="text-slate-500"> · {t.location}</span> : null}
                    {t.eta ? <span className="block text-slate-600 dark:text-slate-300">Expected <span suppressHydrationWarning>{formatUtcStamp(t.eta).replace(/, \d{1,2}:\d{2} [AP]M$/, "")}</span></span> : null}
                  </p>
                )}
                {t.lastError && !t.lastCheckedAt?.length ? null : t.lastError && (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300" data-testid="tracker-error">{t.lastError}</p>
                )}
                {t.history.length > 0 && (
                  <details className="mt-2" data-testid="tracker-history">
                    <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">Scan history ({t.history.length})</summary>
                    <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3 text-xs dark:border-slate-700">
                      {t.history.map((e, i) => (
                        <li key={i}>
                          <span className="font-medium text-slate-800 dark:text-slate-100">{e.status}</span>
                          {e.details ? ` — ${e.details}` : ""}
                          {e.location ? ` · ${e.location}` : ""}
                          <span className="block text-slate-500" suppressHydrationWarning>{formatUtcStamp(e.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {t.manual && t.note && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300" data-testid="tracker-note">{t.note}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span>Updated {ago(t.lastCheckedAt)}</span>
                  {canAdd && t.manual && (asking === t.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-slate-700 dark:text-slate-300">Remove this number?</span>
                      <button type="button" disabled={pending} onClick={() => remove(t.id)} className="font-semibold text-red-700 underline dark:text-red-300" data-testid="tracker-remove-confirm">Yes, remove</button>
                      <button type="button" onClick={() => setAsking(null)} className="underline">Keep</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setAsking(t.id)} className="text-red-700 underline dark:text-red-300" data-testid="tracker-remove">Remove</button>
                  ))}
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                      Open on the {t.carrier} site
                    </a>
                  )}
                </p>
              </div>
            );
          })}
          {canAdd && (
            <form
              onSubmit={(e) => { e.preventDefault(); add(); }}
              className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700"
              data-testid="manual-tracking"
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add a tracking number by hand</p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">For a label made on another website, or when Shippo is down. Add one for each box. Receiving can find the order by this number.</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Tracking number
                  <input id="mt-number" name="trackingNumber" value={num} onChange={(e) => setNum(e.target.value)} autoComplete="off" className="w-64 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800" data-testid="mt-number" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Carrier
                  <select id="mt-carrier" name="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800" data-testid="mt-carrier">
                    <option value="auto">Pick it for me</option>
                    <option value="UPS">UPS</option>
                    <option value="USPS">USPS</option>
                    <option value="FedEx">FedEx</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Note (optional)
                  <input id="mt-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Where the label was made" className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800" data-testid="mt-note" />
                </label>
                <button type="submit" disabled={pending || !num.trim()} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200" data-testid="mt-add">
                  {pending ? "Saving…" : "Add tracking number"}
                </button>
              </div>
              {added && <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300" role="status" data-testid="mt-added">{added}</p>}
            </form>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" data-testid="tracking-refresh" disabled={pending} onClick={() => refresh(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
              {pending ? "Checking…" : "Refresh now"}
            </button>
            {error && <span className="text-xs text-red-700 dark:text-red-400" role="alert">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
