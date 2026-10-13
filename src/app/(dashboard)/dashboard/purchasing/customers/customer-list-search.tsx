"use client";

import { useState } from "react";
import { searchTextMatches } from "@/lib/customer-search";

/**
 * Live search box for the Customers table. The rows are drawn by the server (each carries a
 * `data-search` text and `data-customer-row`); this just shows or hides them as you type, using the
 * same matching rule as the quotation customer picker (first name, last name or full name; email and
 * phone digits also match here).
 */
export function CustomerListSearch({ total }: { total: number }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(total);

  function apply(next: string) {
    setQuery(next);
    let count = 0;
    document.querySelectorAll<HTMLElement>("[data-customer-row]").forEach((row) => {
      const ok = searchTextMatches(row.dataset.search ?? "", next);
      row.hidden = !ok;
      if (ok) count++;
    });
    setShown(count);
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => apply(e.target.value)}
        autoComplete="off"
        data-testid="customers-search"
        placeholder="Search customers by first name, last name or full name"
        aria-label="Search customers"
        className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
      />
      <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="customers-search-count">
        {query.trim() ? `${shown} of ${total}` : `${total} customer${total === 1 ? "" : "s"}, A to Z`}
      </span>
    </div>
  );
}
