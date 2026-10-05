"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = { href: string; label: string };

const HOME = "/dashboard/purchasing";

/** The Purchasing tab strip: soft pills, the open tab filled with the company's theme color. */
export function PurchasingTabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Purchasing sections" className="mb-6 flex flex-wrap gap-1.5 rounded-xl border border-emerald-100 bg-white p-1.5 shadow-sm print:hidden dark:border-emerald-900/60 dark:bg-slate-900">
      {items.map((t) => {
        const active = t.href === HOME ? pathname === HOME : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-50"
                : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
