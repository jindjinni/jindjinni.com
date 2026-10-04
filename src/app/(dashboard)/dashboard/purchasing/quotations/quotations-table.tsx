"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QuotationRowMenu } from "./quotation-row-menu";
import { QuotationImportPanel } from "./quotation-import-panel";

export type QuotationSummaryRow = {
  id: string;
  quotationNumber: string;
  quotationDate: string;
  status: string;
  grandTotal: number;
  trackingNumber: string | null;
  labelStatus: "NOT_GENERATED" | "GENERATED" | "ERROR";
  archivedAt: string | null;
  imported?: boolean;
  customerName: string;
  email: string | null;
  phone: string | null;
  shippingInfo: string;
  itemsSummary: string;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function QuotationsTable({ quotations, canImport = false }: { quotations: QuotationSummaryRow[]; canImport?: boolean }) {
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotations.filter((row) => {
      if (fromDate && row.quotationDate < fromDate) return false;
      if (toDate && row.quotationDate > toDate) return false;
      if (!q) return true;
      return (
        row.quotationNumber.toLowerCase().includes(q) ||
        row.customerName.toLowerCase().includes(q) ||
        (row.email ?? "").toLowerCase().includes(q) ||
        (row.phone ?? "").toLowerCase().includes(q) ||
        (row.trackingNumber ?? "").toLowerCase().includes(q) ||
        (row.imported && row.itemsSummary.toLowerCase().includes(q))
      );
    });
  }, [quotations, search, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visible = filtered.slice(pageStart, pageStart + pageSize);

  function goToPage(n: number) {
    setPage(Math.min(Math.max(1, n), pageCount));
  }

  function exportCsv() {
    const header = [
      "Date",
      "Reference #",
      "Customer Name",
      "Email",
      "Phone",
      "Total Price",
      "Shipping Info",
      "Items Quoted For",
      "Tracking #",
    ];
    const lines = [header.join(",")];
    for (const row of filtered) {
      lines.push(
        [
          row.quotationDate,
          row.quotationNumber,
          row.customerName,
          row.email ?? "",
          row.phone ?? "",
          row.grandTotal.toFixed(2),
          row.shippingInfo,
          row.itemsSummary,
          row.trackingNumber ?? "",
        ]
          .map((v) => csvEscape(String(v)))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotation-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Quotation Summary</h1>
            <p className="mt-0.5 text-sm text-blue-100">Every quotation, at a glance -- search, filter, and ship from one place.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canImport && (
              <button
                type="button"
                onClick={() => setShowImport((v) => !v)}
                aria-expanded={showImport}
                className="rounded-md border border-white/60 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                Import orders
              </button>
            )}
            <Link
              href="/dashboard/purchasing/quotations/new"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-50"
            >
              + New Quotation
            </Link>
          </div>
        </div>
        {canImport && showImport && <QuotationImportPanel onClose={() => setShowImport(false)} />}
        <div className="relative mt-4">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5.5" />
            <path d="M11.5 11.5 15 15" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by reference, customer, email, phone, or tracking #..."
            className="w-full rounded-md border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-1 ring-blue-300 placeholder:text-slate-400 focus:ring-2 focus:ring-white"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Clear Dates
            </button>
          )}
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Show:
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Export
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-blue-50 text-xs font-semibold uppercase tracking-wide text-blue-900 dark:border-slate-800 dark:bg-blue-950 dark:text-blue-200">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Date</th>
              <th className="whitespace-nowrap px-4 py-3">Reference #</th>
              <th className="whitespace-nowrap px-4 py-3">Customer Name</th>
              <th className="whitespace-nowrap px-4 py-3">Email</th>
              <th className="whitespace-nowrap px-4 py-3">Phone</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Total Price</th>
              <th className="whitespace-nowrap px-4 py-3">Shipping Info</th>
              <th className="px-4 py-3">Items Quoted For</th>
              <th className="whitespace-nowrap px-4 py-3">Tracking #</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  {quotations.length === 0 ? "No quotations yet -- generate one above." : "No matches for that search."}
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">{row.quotationDate}</td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <Link
                    href={`/dashboard/purchasing/quotations/${row.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {row.quotationNumber}
                  </Link>
                  {row.imported && (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      Imported
                    </span>
                  )}
                  {row.archivedAt && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">
                      Archived
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900 dark:text-slate-50">{row.customerName}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">{row.email ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">{row.phone ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${row.grandTotal.toFixed(2)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                  {row.shippingInfo === "Not provided" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      Not provided
                    </span>
                  ) : (
                    row.shippingInfo
                  )}
                </td>
                <td className="min-w-[14rem] px-4 py-3.5 text-slate-700 dark:text-slate-300">{row.itemsSummary}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                  {row.trackingNumber ?? (row.labelStatus === "GENERATED" ? "Generated" : "—")}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <QuotationRowMenu quotationId={row.id} label={row.quotationNumber} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-1">
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pageCount || Math.abs(n - currentPage) <= 2)
              .reduce<number[]>((acc, n) => {
                if (acc.length > 0 && n - acc[acc.length - 1] > 1) acc.push(-1);
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                n === -1 ? (
                  <span key={`ellipsis-${i}`} className="px-2">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => goToPage(n)}
                    className={
                      n === currentPage
                        ? "rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                        : "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    }
                  >
                    {n}
                  </button>
                ),
              )}
            {currentPage < pageCount && (
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Next
              </button>
            )}
          </div>
          <p>
            Showing {pageStart + 1}-{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length} record
            {filtered.length === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
