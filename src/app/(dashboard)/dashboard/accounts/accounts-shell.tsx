"use client";

// The To Be Paid area. On the list page the waiting orders sit on the left as small cards. Inside an order the
// complete receiving form gets the whole width, and the list is one tap away in a slide-over ("Orders waiting").
// This is the same arrangement as the Receiving intake list. The same shell serves Paid Orders (mode "paid").

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AccountsOrder } from "@/lib/accounts-rules";
import { AccountsList } from "./accounts-list";
import { PaidList } from "./paid/paid-list";

const DETAIL = { waiting: /^\/dashboard\/accounts\/(?!paid(\/|$))[^/]+/, paid: /^\/dashboard\/accounts\/paid\/[^/]+/ };

export function AccountsShell({ mode = "waiting", orders, children }: { mode?: "waiting" | "paid"; orders: AccountsOrder[]; children: React.ReactNode }) {
  const path = usePathname();
  // Open only for the page it was opened on, so moving to another order closes it by itself.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === path;

  const List = mode === "paid" ? PaidList : AccountsList;
  const title = mode === "paid" ? "Paid Orders" : "To Be Paid";
  if (!DETAIL[mode].test(path)) {
    return (
      <div className="flex flex-col lg:flex-row">
        <div className="w-full shrink-0 border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-[calc(100vh-3.4rem)] lg:w-[22rem] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-900">
          <List orders={orders} />
        </div>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenFor(open ? null : path)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          {mode === "paid" ? "Paid orders" : `Orders waiting to be paid (${orders.length})`}
        </button>
      </div>
      <div className="min-w-0 px-4 py-6 sm:px-8">{children}</div>

      {open && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-label={title}>
          <div className="h-full w-[min(22rem,100vw)] overflow-y-auto border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold">{title}</span>
              <button type="button" onClick={() => setOpenFor(null)} className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                Close
              </button>
            </div>
            <List orders={orders} />
          </div>
          <button type="button" aria-label="Close the list" onClick={() => setOpenFor(null)} className="flex-1 bg-black/30" />
        </div>
      )}
    </div>
  );
}
