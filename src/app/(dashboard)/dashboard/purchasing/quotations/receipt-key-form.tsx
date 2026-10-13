"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReceiptFileNames, type ReceiptKeyState } from "@/app/actions/purchasing-import";

/** Fills in the "Receipt File Name" on orders that are already imported, from a sheet with just a reference # and a Receipt File Name. Nothing else changes. */
export function ReceiptKeyForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [state, setState] = useState<ReceiptKeyState>(undefined);
  const [pending, startTransition] = useTransition();

  function run() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState({ error: "Choose a CSV or Excel file first." });
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        setState(await addReceiptFileNames(undefined, fd));
        router.refresh();
      } catch {
        setState({ error: "Something went wrong reading that file. Try again." });
      }
    });
  }

  return (
    <div data-testid="rk-form" className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-semibold">Already imported? Add the Receipt File Name to those orders</h3>
      <p className="mt-0.5 max-w-2xl text-xs text-slate-600">
        Upload a sheet that has a <strong>Customer Reference Number</strong> column and a <strong>Receipt File Name</strong> column (the full import file works too &mdash; other columns are ignored). Each order that matches by reference # gets its unique receipt name.
        Nothing else on the order changes, and nothing is deleted or added.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id="receipt-key-file"
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          data-testid="rk-file"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? "");
            setState(undefined);
          }}
          className="block max-w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700"
        />
        <button
          type="button"
          disabled={pending || !fileName}
          onClick={run}
          data-testid="rk-run"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add receipt file names"}
        </button>
      </div>
      {state && "error" in state && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state && "kind" in state && (
        <div data-testid="rk-result" className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="text-sm font-medium text-emerald-900">
            Added the receipt file name to {state.updated} order{state.updated === 1 ? "" : "s"}.
          </p>
          <p className="mt-0.5 text-emerald-900/80">
            {state.same} already had it · {state.skipped} skipped (listed below).
          </p>
          {state.lines.length > 0 && (
            <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Row</th>
                    <th className="px-2 py-1.5 font-medium">Reference #</th>
                    <th className="px-2 py-1.5 font-medium">Result</th>
                    <th className="px-2 py-1.5 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.lines.map((l, i) => (
                    <tr key={`${l.rowNumber}-${i}`}>
                      <td className="px-2 py-1.5 tabular-nums text-slate-500">{l.rowNumber}</td>
                      <td className="px-2 py-1.5 font-medium text-slate-800">{l.reference || "—"}</td>
                      <td className="px-2 py-1.5">{l.result === "skipped" ? "Skipped" : "Replaced"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{l.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
