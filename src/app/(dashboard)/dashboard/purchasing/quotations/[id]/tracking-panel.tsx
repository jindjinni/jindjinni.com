"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshQuotationTracking } from "@/app/actions/tracking";
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
}: {
  quotationId: string;
  trackers: TrackerView[];
  summary: { status: string; delivered: number; total: number } | null;
  hasNumber: boolean;
  needsRefresh: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const attempts = useRef(0);

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

  if (!hasNumber && trackers.length === 0) return null;

  const multi = summary && summary.total > 1;
  return (
    <div className="mt-1.5" data-testid="tracking-panel">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {summary ? (
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
          {open ? "Hide tracking" : "Tracking details"}
        </button>
        {pending && <span className="text-xs text-slate-500" role="status">Checking with Shippo…</span>}
      </div>

      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900" data-testid="tracking-details">
          {trackers.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-300">No package is being tracked yet. Add a tracking number or buy a label.</p>}
          {trackers.map((t) => {
            const link = t.trackingUrl || carrierTrackingLink(t.carrier, t.trackingNumber);
            return (
              <div key={t.id} data-testid="tracker" className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  {t.labelName && <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{t.labelName}</span>}
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
                <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span>Updated {ago(t.lastCheckedAt)}</span>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                      Open on the {t.carrier} site
                    </a>
                  )}
                </p>
              </div>
            );
          })}
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
