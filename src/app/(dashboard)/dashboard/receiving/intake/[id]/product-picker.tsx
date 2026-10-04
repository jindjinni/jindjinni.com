"use client";

// Product dropdown for Receiving: filter by brand, type to narrow, pick from the list.
// The list is the same product catalog Purchasing quotes from; an NDC on the product is shown right in the list
// and copied onto the receiving line when the product is picked.

import { useId, useMemo, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/receiving-queries";
import { field } from "./intake-parts";

const MAX_SHOWN = 60;

export function ProductPicker({
  catalog,
  disabled,
  onPick,
  placeholder = "Choose a product…",
}: {
  catalog: CatalogProduct[];
  disabled?: boolean;
  onPick: (product: CatalogProduct) => void;
  placeholder?: string;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [brand, setBrand] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const brands = useMemo(() => {
    const seen: string[] = [];
    for (const p of catalog) if (!seen.includes(p.brand)) seen.push(p.brand);
    return seen;
  }, [catalog]);

  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    return catalog.filter((p) => (!brand || p.brand === brand) && (!t || `${p.name} ${p.productCode ?? ""} ${p.ndc ?? ""} ${p.brand}`.toLowerCase().includes(t)));
  }, [catalog, brand, term]);
  const shown = matches.slice(0, MAX_SHOWN);

  function pick(p: CatalogProduct) {
    onPick(p);
    setTerm("");
    setOpen(false);
    setActive(0);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
      <div>
        <label htmlFor={`${uid}-brand`} className="text-xs font-medium text-slate-600 dark:text-slate-400">Brand</label>
        <select id={`${uid}-brand`} className={field} value={brand} disabled={disabled} onChange={(e) => { setBrand(e.target.value); setActive(0); setOpen(true); inputRef.current?.focus(); }}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="relative">
        <label htmlFor={`${uid}-input`} className="text-xs font-medium text-slate-600 dark:text-slate-400">Product ({matches.length})</label>
        <input
          id={`${uid}-input`}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${uid}-opt-${active}` : undefined}
          autoComplete="off"
          className={field}
          placeholder={placeholder}
          value={term}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setTerm(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching product.</li>}
            {shown.map((p, i) => (
              <li
                key={p.id}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-amber-100 dark:bg-amber-950/50" : ""}`}
              >
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-slate-500">
                  {p.brand}
                  {p.productCode ? ` · ${p.productCode}` : ""} · {p.ndc ? `NDC ${p.ndc}` : "no NDC on file"}
                </span>
              </li>
            ))}
            {matches.length > shown.length && <li className="px-3 py-2 text-xs text-slate-500">Showing {shown.length} of {matches.length}. Type to narrow the list.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
