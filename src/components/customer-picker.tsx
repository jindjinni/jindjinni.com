"use client";

import { useMemo, useState } from "react";
import { customerDisplayName, matchesCustomerSearch } from "@/lib/customer-search";

export type PickerCustomer = {
  id: string;
  firstName: string;
  lastName: string | null;
  email?: string | null;
  phone?: string | null;
  noAddress?: boolean;
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

/**
 * Find an existing customer by typing. Type a first name, a last name or the full name and everyone who
 * matches is listed A-Z; click one (or press Enter to take the first) to choose them. The chosen customer's
 * id goes to the server as `name` (default "customerId"), exactly like the old drop-down did.
 */
export function CustomerPicker({
  customers,
  name = "customerId",
  defaultId,
  onChange,
}: {
  customers: PickerCustomer[];
  name?: string;
  defaultId?: string;
  onChange?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(defaultId && customers.some((c) => c.id === defaultId) ? defaultId : "");
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const matches = useMemo(() => customers.filter((c) => matchesCustomerSearch(c, query)), [customers, query]);

  function choose(id: string) {
    setSelectedId(id);
    setQuery("");
    onChange?.(id);
  }

  return (
    <div className="mt-3 max-w-xl text-sm" data-testid="customer-picker">
      <input type="hidden" name={name} value={selectedId} />
      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40" data-testid="cust-selected">
          <span className="text-slate-900 dark:text-slate-50">
            <span className="font-medium">{customerDisplayName(selected)}</span>
            {selected.noAddress ? <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">address not added yet</span> : null}
          </span>
          <button
            type="button"
            data-testid="cust-change"
            onClick={() => choose("")}
            className="text-xs text-emerald-800 underline dark:text-emerald-300"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">Search customers by first name, last name or full name</span>
            <input
              type="search"
              value={query}
              autoComplete="off"
              data-testid="cust-search"
              placeholder={`Start typing a name -- ${customers.length} customer${customers.length === 1 ? "" : "s"} on file`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches.length > 0) choose(matches[0].id);
                }
              }}
              className={inputClass}
            />
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="cust-count">
            {query.trim() ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : `All ${customers.length}, A to Z`}
            {matches.length > 0 ? " -- click a name to choose it (Enter picks the first)." : ""}
          </p>
          <ul
            className="mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            data-testid="cust-results"
          >
            {matches.length === 0 && (
              <li className="px-3 py-3 text-slate-500 dark:text-slate-400">
                No customer with that name. Choose &ldquo;New customer&rdquo; above to add them.
              </li>
            )}
            {matches.map((c) => (
              <li key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <button
                  type="button"
                  data-testid="cust-option"
                  onClick={() => choose(c.id)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <span className="text-slate-900 dark:text-slate-50">{customerDisplayName(c)}</span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[c.email, c.phone].filter(Boolean).join(" · ")}
                    {c.noAddress ? `${c.email || c.phone ? " · " : ""}address not added yet` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
