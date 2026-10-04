"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function QuotationRowMenu({ quotationId, label }: { quotationId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const itemClass = "block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="2.5" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13.5" r="1.4" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          onClick={() => setOpen(false)}
        >
          <Link href={`/dashboard/purchasing/quotations/${quotationId}/receipt`} className={itemClass}>
            View PDF
          </Link>
          <Link href={`/dashboard/purchasing/quotations/${quotationId}/receipt?autoprint=1`} target="_blank" className={itemClass}>
            Download
          </Link>
          <Link href={`/dashboard/purchasing/quotations/${quotationId}`} className={itemClass}>
            Edit
          </Link>
          <Link href={`/dashboard/purchasing/quotations/${quotationId}#shipping`} className={itemClass}>
            Ship
          </Link>
        </div>
      )}
    </div>
  );
}
