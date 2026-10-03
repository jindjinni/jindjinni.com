"use client";

import { useEffect, useRef, useState } from "react";
import type { AddressSuggestion } from "@/lib/address-autocomplete-types";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

/**
 * Street Line 1 + City/State/ZIP for any US address in the app -- Business
 * Profile (business and shipping address) and Purchasing customers (the
 * customer edit page and the inline new-customer-on-quotation form). Typing
 * into Street Line 1 suggests real US addresses (via /api/address-
 * autocomplete); picking one fills City/State/ZIP automatically. Line 2
 * (apartment/suite) is always a plain manual field, per how this was asked
 * for -- autocomplete only ever touches street1/city/state/zip.
 *
 * Every field still renders as a normal named input, so the parent
 * <form>'s native FormData submission (every Purchasing/Profile form in
 * this app) picks it up exactly like before -- this component only adds
 * the suggestion behavior, it doesn't change how a form is submitted.
 */
export function AddressAutocompleteFields({
  prefix,
  defaultValues,
  showStreet2 = true,
  required = false,
}: {
  /** Field name prefix, e.g. "businessAddress" -> businessAddressStreet1, businessAddressCity, ... */
  prefix: string;
  defaultValues?: {
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  showStreet2?: boolean;
  /** Marks Street 1 / City / State / ZIP as required (e.g. at signup). Line 2 never is. */
  required?: boolean;
}) {
  const [street1, setStreet1] = useState(defaultValues?.street1 ?? "");
  const [city, setCity] = useState(defaultValues?.city ?? "");
  const [state, setState] = useState(defaultValues?.state ?? "");
  const [zip, setZip] = useState(defaultValues?.zip ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const skipNextFetch = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (street1.trim().length < 3) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address-autocomplete?q=${encodeURIComponent(street1)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: AddressSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setHighlighted(0);
      } catch {
        // Suggestion lookup is best-effort -- never block manual typing.
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [street1]);

  function pick(s: AddressSuggestion) {
    skipNextFetch.current = true;
    setStreet1(s.street1 ?? street1);
    if (s.city) setCity(s.city);
    if (s.state) setState(s.state);
    if (s.zip) setZip(s.zip);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <>
      <div ref={wrapperRef} className="relative flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium text-slate-700 dark:text-slate-300">Address Line 1</span>
        <input
          name={`${prefix}Street1`}
          value={street1}
          required={required}
          onChange={(e) => {
            const value = e.target.value;
            setStreet1(value);
            if (value.trim().length < 3) {
              setSuggestions([]);
              setOpen(false);
            }
          }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(suggestions[highlighted]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          autoComplete="off"
          placeholder="Start typing a US street address..."
          className={inputClass}
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {suggestions.map((s, i) => (
              <li key={s.label}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className={`block w-full px-3 py-2 text-left ${
                    i === highlighted
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <span className="text-xs text-slate-400">US addresses only -- pick a suggestion to fill in City/State/ZIP.</span>
      </div>

      {showStreet2 && (
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700 dark:text-slate-300">Address Line 2 / Suite</span>
          <input name={`${prefix}Street2`} defaultValue={defaultValues?.street2 ?? ""} className={inputClass} />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">City</span>
        <input
          name={`${prefix}City`}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required={required}
          className={inputClass}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">State</span>
          <input
            name={`${prefix}State`}
            value={state}
            onChange={(e) => setState(e.target.value)}
            maxLength={2}
            required={required}
            className={inputClass}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">ZIP Code</span>
          <input
            name={`${prefix}Zip`}
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            required={required}
            className={inputClass}
          />
        </label>
      </div>
    </>
  );
}
