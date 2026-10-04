"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import {
  duplicatePurchasingProduct,
  archivePurchasingProduct,
  restorePurchasingProduct,
  deletePurchasingProduct,
} from "@/app/actions/purchasing";

/**
 * The "..." menu on each row of the Products list -- Edit / Duplicate /
 * Archive / Delete, all in one place instead of making someone open the
 * product's own page just to archive or copy it. Edit still goes to the
 * full product page (that's where multipliers live, too much for a
 * dropdown); the rest run in place and refresh the list.
 */
export function ProductRowActions({
  productId,
  productName,
  archived,
}: {
  productId: string;
  productName: string;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function runAndClose(action: () => Promise<{ error?: string } | undefined>) {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label={`Actions for ${productName}`}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="2.5" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13.5" r="1.4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <Link
            href={`/dashboard/purchasing/products/${productId}`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => runAndClose(() => duplicatePurchasingProduct(productId, undefined, new FormData()))}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Duplicate
          </button>
          {archived ? (
            <button
              type="button"
              onClick={() => runAndClose(() => restorePurchasingProduct(productId, undefined, new FormData()))}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => runAndClose(() => archivePurchasingProduct(productId, undefined, new FormData()))}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Archive
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Permanently delete "${productName}"? This can't be undone.`)) return;
              runAndClose(() => deletePurchasingProduct(productId, undefined, new FormData()));
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      )}

      {error && (
        <p className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
