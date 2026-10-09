"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MothershipTabs({ tabs }: { tabs: { href: string; label: string; badge: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Mothership" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            data-testid={`mtab-${t.label.toLowerCase()}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm ${active ? "border-emerald-600 font-medium text-emerald-800 dark:text-emerald-300" : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
          >
            {t.label}
            {t.badge > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid={`mbadge-${t.label.toLowerCase()}`}>{t.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
