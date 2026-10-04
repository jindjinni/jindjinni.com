"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNav({ sections }: { sections: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:flex-col">
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
              active
                ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
