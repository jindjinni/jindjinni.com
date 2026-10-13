"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteQuotations, previewQuotationDelete } from "@/app/actions/purchasing-delete";
import { DELETE_ALL_PHRASE, DELETE_PAID_PHRASE, type DeletionPreview } from "@/lib/quotation-delete-text";

/**
 * The confirm step for deleting quotations. `ids` = the ones picked in the list; `null` = every quotation.
 * It first asks the server what would go (nothing is changed yet), then needs a click -- and for "all" (or when some
 * orders are already Paid) a typed word.
 */
export function QuotationDeletePanel({ ids, onClose, onDeleted }: { ids: string[] | null; onClose: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    previewQuotationDelete(ids).then((r) => {
      if (!alive) return;
      if ("error" in r) setError(r.error);
      else setPreview(r.preview);
    });
    return () => {
      alive = false;
    };
  }, [ids]);

  const all = ids === null;
  const needWord = all ? DELETE_ALL_PHRASE : preview && preview.paid > 0 ? DELETE_PAID_PHRASE : null;
  const ready = !!preview && preview.quotations > 0 && (!needWord || typed.trim().toUpperCase() === needWord);

  function confirm() {
    setError("");
    startTransition(async () => {
      const r = await deleteQuotations(ids, typed);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setDone(`Deleted ${r.deleted} quotation${r.deleted === 1 ? "" : "s"}.`);
      onDeleted();
      router.refresh();
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Delete quotations" data-testid="qdel-panel" className="mt-4 rounded-lg border border-red-200 bg-white p-4 text-slate-900 shadow-sm">
      {done ? (
        <>
          <p data-testid="qdel-done" className="text-sm font-medium text-emerald-800">{done}</p>
          <button type="button" onClick={onClose} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-red-800">
            {all ? "Delete ALL quotations?" : `Delete ${ids!.length} selected quotation${ids!.length === 1 ? "" : "s"}?`}
          </h2>
          {!preview && !error && <p className="mt-2 text-xs text-slate-500">Checking what would be removed…</p>}
          {preview && (
            <div className="mt-2 text-xs text-slate-700" data-testid="qdel-summary">
              <p>
                This permanently removes <strong>{preview.quotations}</strong> quotation{preview.quotations === 1 ? "" : "s"}, their items and receipt files
                {preview.withReceiving > 0 && <>, and <strong>{preview.withReceiving}</strong> receiving package{preview.withReceiving === 1 ? "" : "s"} made from them (with photos and scans)</>}. It can&rsquo;t be undone.
              </p>
              <p className="mt-1 text-slate-500">Your customers, products, prices and settings are not touched. Orders from the website keep their request but lose the link.</p>
              {preview.labels > 0 && (
                <p className="mt-1 text-amber-800">
                  {preview.labels} shipping label{preview.labels === 1 ? " was" : "s were"} already bought. Deleting the order doesn&rsquo;t refund or void a label in Shippo.
                </p>
              )}
              {preview.paid > 0 && (
                <p className="mt-1 font-medium text-red-700">
                  {preview.paid} of these {preview.paid === 1 ? "is" : "are"} already marked Paid by Accounts.
                </p>
              )}
              {needWord && (
                <label className="mt-3 flex flex-col gap-1">
                  <span>
                    Type <strong>{needWord}</strong> to confirm
                  </span>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    data-testid="qdel-type"
                    autoComplete="off"
                    className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600"
                  />
                </label>
              )}
            </div>
          )}
          {error && (
            <p role="alert" data-testid="qdel-error" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!ready || pending}
              onClick={confirm}
              data-testid="qdel-confirm"
              className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? "Deleting…" : preview ? `Delete ${preview.quotations} quotation${preview.quotations === 1 ? "" : "s"}` : "Delete"}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
