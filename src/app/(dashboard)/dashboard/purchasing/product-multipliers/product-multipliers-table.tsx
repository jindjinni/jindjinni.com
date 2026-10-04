"use client";

import { useMemo, useState } from "react";
import { ProductMultiplierRow, type MultiplierRow } from "./product-multiplier-row";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function ProductMultipliersTable({ rows }: { rows: MultiplierRow[] }) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.productName.toLowerCase().includes(q) || r.expirationRangeLabel.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visible = filtered.slice(pageStart, pageStart + pageSize);

  function goToPage(n: number) {
    setPage(Math.min(Math.max(1, n), pageCount));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search product or month range..."
          className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
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
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Month Range</th>
              <th className="px-4 py-3 font-medium">Price Multiplier</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {rows.length === 0 ? "No product multipliers yet -- add one above." : "No matches for that search."}
                </td>
              </tr>
            )}
            {visible.map((r, i) => (
              <ProductMultiplierRow key={r.id} row={r} rowNumber={pageStart + i + 1} />
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
