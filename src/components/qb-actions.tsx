"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshReportAction, uploadReportAction } from "@/app/actions/quickbooks";

const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const primary = "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";

/** Pull a fresh copy from QuickBooks Online, or upload an exported CSV from QuickBooks Desktop / Enterprise. */
export function QbActions({ kind, canPull, online, fileHint }: { kind: string; canPull: boolean; online: boolean; fileHint: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!canPull) return null;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {online && (
          <button
            type="button"
            className={primary}
            disabled={pending}
            data-testid={`qb-pull-${kind}`}
            onClick={() =>
              start(async () => {
                const r = await refreshReportAction(kind);
                setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? "Working..." : "Pull from QuickBooks"}
          </button>
        )}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("kind", kind);
            start(async () => {
              const r = await uploadReportAction(fd);
              setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
              if (r.ok) {
                if (fileRef.current) fileRef.current.value = "";
                router.refresh();
              }
            });
          }}
        >
          <label htmlFor={`qb-file-${kind}`} className="sr-only">Choose a CSV file exported from QuickBooks</label>
          <input id={`qb-file-${kind}`} ref={fileRef} name="file" type="file" accept=".csv,.txt,text/csv" className="max-w-[16rem] text-sm text-slate-700 dark:text-slate-300" data-testid={`qb-file-${kind}`} />
          <button className={btn} disabled={pending} data-testid={`qb-upload-${kind}`}>Upload a file</button>
        </form>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{fileHint}</p>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid={msg.ok ? `qb-ok-${kind}` : `qb-error-${kind}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
