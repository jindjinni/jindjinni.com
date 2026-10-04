"use client";

import { useActionState, type ReactNode } from "react";

type ImportActionState = { error?: string; message?: string } | undefined;
type ImportAction = (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;

function escapeCsvCell(cell: string) {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Reusable "Import from CSV/Excel" widget -- used on the Purchasing
 * Products and Customers screens, and easy to drop onto any other list
 * that gets its own server action following the same
 * (prevState, formData) => Promise<{error?, message?}> shape.
 */
export function ImportSpreadsheetForm({
  action,
  title,
  columnsHelp,
  templateFilename,
  templateHeaders,
  templateSampleRow,
  extraFields,
}: {
  action: ImportAction;
  title: string;
  columnsHelp: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRow: string[];
  /** Optional extra controls (checkboxes etc.) rendered inside the form. */
  extraFields?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ImportActionState, FormData>(action, undefined);

  const downloadTemplate = () => {
    const csv = [templateHeaders, templateSampleRow].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <form
      action={formAction}
      className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700"
    >
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{columnsHelp}</p>
      {extraFields && <div className="mt-3 flex flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">{extraFields}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls,.txt"
          required
          className="text-sm text-slate-700 dark:text-slate-300"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import"}
        </button>
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-sm text-emerald-700 underline hover:no-underline dark:text-emerald-400"
        >
          Download a template
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.message && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </form>
  );
}
