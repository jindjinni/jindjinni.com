"use client";

// The Receiving Intake area. On the list page the shipment list sits on the left. Inside a shipment the form gets the
// whole width, and the list is one tap away in a slide-over ("Shipments") instead of taking up the screen.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { BoardCard } from "@/lib/receiving-queries";
import { IntakeList } from "./intake-list";

const DETAIL = /^\/dashboard\/receiving\/intake\/[^/]+/;

export function IntakeShell({ cards, canWrite, children }: { cards: BoardCard[]; canWrite: boolean; children: React.ReactNode }) {
  const path = usePathname();
  // Open only for the page it was opened on, so moving to another shipment closes it by itself.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === path;

  if (!DETAIL.test(path)) {
    return (
      <div className="flex flex-col lg:flex-row">
        <div className="w-full shrink-0 border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-[calc(100vh-3.4rem)] lg:w-[22rem] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-900">
          <IntakeList cards={cards} canWrite={canWrite} />
        </div>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
        <Link href="/dashboard/receiving" className="text-sm font-medium text-amber-900 hover:underline dark:text-amber-300">
          ← All shipments
        </Link>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenFor(open ? null : path)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Shipments · receive an order
        </button>
      </div>
      <div className="min-w-0 px-4 py-6 sm:px-8">{children}</div>

      {open && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-label="Shipments">
          <div className="h-full w-[min(22rem,100vw)] overflow-y-auto border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold">Shipments</span>
              <button type="button" onClick={() => setOpenFor(null)} className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                Close
              </button>
            </div>
            <IntakeList cards={cards} canWrite={canWrite} />
          </div>
          <button type="button" aria-label="Close shipments" onClick={() => setOpenFor(null)} className="flex-1 bg-black/30" />
        </div>
      )}
    </div>
  );
}
