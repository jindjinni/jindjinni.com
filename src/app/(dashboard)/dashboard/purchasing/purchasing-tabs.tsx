"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = { href: string; label: string; /** Setup and record-keeping tabs: shown after the everyday ones, a little quieter. */ secondary?: boolean };

const HOME = "/dashboard/purchasing";

/** The Purchasing tab strip: soft pills, the open tab filled with the company's theme color. */
export function PurchasingTabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Purchasing sections" className="mb-6 flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-100 bg-white p-1.5 shadow-sm print:hidden dark:border-emerald-900/60 dark:bg-slate-900">
      {items.map((t, i) => {
        const active = t.href === HOME ? pathname === HOME : pathname === t.href || pathname.startsWith(t.href + "/");
        const startsSetup = t.secondary && !items[i - 1]?.secondary;
        return (
          <Fragment key={t.href}>
            {startsSetup && (
              <>
                <span aria-hidden className="basis-full" />
                <span className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Setup</span>
              </>
            )}
            <Link
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 transition-colors ${t.secondary ? "text-[13px]" : "text-sm"} ${
                active
                  ? "bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-50"
                  : t.secondary
                    ? "text-slate-500 hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                    : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
              }`}
            >
              {t.label}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
