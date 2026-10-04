"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewQuotationImport,
  importQuotations,
  type QuotationImportState,
} from "@/app/actions/purchasing-import";
import { IMPORT_TEMPLATE_HEADERS, IMPORT_TEMPLATE_SAMPLE } from "@/lib/purchasing-quotation-import";

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function downloadTemplate() {
  const csv = [IMPORT_TEMPLATE_HEADERS, IMPORT_TEMPLATE_SAMPLE].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "quotation-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL = { new: "Imported with note", duplicate: "Skipped (already there)", error: "Skipped (problem)" } as const;
const STATUS_STYLE = {
  new: "bg-amber-50 text-amber-800",
  duplicate: "bg-slate-100 text-slate-700",
  error: "bg-red-50 text-red-700",
} as const;

function Lines({ state }: { state: Exclude<NonNullable<QuotationImportState>, { error: string }> }) {
  if (state.lines.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-600">
        {state.kind === "preview" ? "What will be skipped or flagged" : "Skipped rows and notes"}
        {state.linesTruncated ? " (first 300 shown)" : ""}
      </p>
      <div className="mt-1 max-h-64 overflow-auto rounded-md border border-slate-200">
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
                <td className="px-2 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                </td>
                <td className="px-2 py-1.5 text-slate-600">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QuotationImportPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [state, setState] = useState<QuotationImportState>(undefined);
  const [pending, startTransition] = useTransition();

  function buildForm() {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    const fd = new FormData();
    fd.set("file", file);
    return fd;
  }

  function run(kind: "preview" | "import") {
    const fd = buildForm();
    if (!fd) {
      setState({ error: "Choose a CSV or Excel file first." });
      return;
    }
    startTransition(async () => {
      try {
        const result = kind === "preview" ? await previewQuotationImport(undefined, fd) : await importQuotations(undefined, fd);
        setState(result);
        if (kind === "import") router.refresh();
      } catch {
        setState({ error: "Something went wrong reading that file. Try again, or split it into a smaller file." });
      }
    });
  }

  const done = state && "kind" in state && state.kind === "done";

  return (
    <div className="mt-4 rounded-lg bg-white p-4 text-slate-900 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Import orders from a spreadsheet</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-600">
            For orders that came through your other quotation website. Use a CSV or Excel file with the same columns as your Airtable
            &ldquo;OVERALL ORDERS&rdquo; table. Reference #, Customer Name and Total Price are required. Orders already in the list (same
            reference # or tracking #) are skipped and shown in the report. New customers are added automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={downloadTemplate} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Download template
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id="quotation-import-file"
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? "");
            setState(undefined);
          }}
          className="block max-w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
        <button
          type="button"
          disabled={pending || !fileName || done}
          onClick={() => run("preview")}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending && !(state && "kind" in state && state.kind === "preview") ? "Checking…" : "Check file"}
        </button>
      </div>

      {state && "error" in state && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      {state && "kind" in state && state.kind === "preview" && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <p className="text-sm font-medium text-slate-900">{state.fileName}</p>
          <p className="mt-1 text-slate-700">
            <strong>{state.newCount}</strong> new order{state.newCount === 1 ? "" : "s"} to import
            {state.duplicateCount > 0 && <> · <strong>{state.duplicateCount}</strong> already in the list (will be skipped)</>}
            {state.errorCount > 0 && <> · <strong>{state.errorCount}</strong> with a problem (will be skipped)</>}
          </p>
          <p className="mt-0.5 text-slate-600">
            {state.newCustomers} new customer{state.newCustomers === 1 ? "" : "s"} will be added; {state.existingCustomers} matched to existing customers.
            {state.warningCount > 0 && ` ${state.warningCount} order(s) have notes (listed below) but will still import.`}
          </p>
          <Lines state={state} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || state.newCount === 0}
              onClick={() => run("import")}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Importing…" : `Import ${state.newCount} order${state.newCount === 1 ? "" : "s"}`}
            </button>
            {state.newCount === 0 && <span className="self-center text-slate-600">Nothing new to import.</span>}
          </div>
        </div>
      )}

      {state && "kind" in state && state.kind === "done" && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="text-sm font-medium text-emerald-900">
            Imported {state.imported} order{state.imported === 1 ? "" : "s"} from {state.fileName}.
          </p>
          <p className="mt-0.5 text-emerald-900/80">
            {state.newCustomers} new customer{state.newCustomers === 1 ? "" : "s"} added · {state.duplicateCount} skipped as already there · {state.errorCount} skipped for a problem.
          </p>
          <Lines state={state} />
          <button
            type="button"
            onClick={() => {
              setState(undefined);
              setFileName("");
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="mt-3 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
