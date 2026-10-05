"use client";

import { useEffect, useId, useRef, useState } from "react";
import { deleteReceivingShipment } from "@/app/actions/receiving";

/**
 * The three-dots menu on a shipment (board card or list row). "Delete shipment" is for an order pulled over by mistake:
 * it asks first, removes the shipment from Receiving, and puts the order back so it can be received again.
 */
export function ShipmentMenu({
  id,
  label,
  submitted,
  className = "",
  onDeleted,
  onError,
}: {
  id: string;
  /** What the shipment is called in the confirmation, e.g. "TEST - Lisa Bennett — REF-261005-56". */
  label: string;
  /** True when the shipment was already submitted (the message says so). */
  submitted: boolean;
  className?: string;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function remove() {
    setOpen(false);
    const ok = window.confirm(
      `Delete this shipment?\n\n${label}\n\nIt is removed from Receiving, with its photos and product lines${
        submitted ? " (it was already submitted)" : ""
      }. The order stays in Purchasing and can be received again.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteReceivingShipment(id);
      if (res.error) onError(res.error);
      else onDeleted(id);
    } catch (e) {
      onError((e as Error).message || "Couldn't delete the shipment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrap} className={className || "relative"}>
      <button
        type="button"
        aria-label={`Options for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg font-bold leading-none text-slate-700 shadow ring-1 ring-slate-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600 disabled:opacity-50 dark:bg-slate-900/90 dark:text-slate-100 dark:ring-slate-600"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void remove();
            }}
            className="block w-full px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            Delete shipment
          </button>
        </div>
      )}
    </div>
  );
}
