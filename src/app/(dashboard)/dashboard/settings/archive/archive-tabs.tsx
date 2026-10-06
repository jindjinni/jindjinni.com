"use client";

import { useState, type ReactNode } from "react";

type Tab = { key: string; label: string; count: number; content: ReactNode };

/**
 * Pure presentation -- every tab's table is already server-rendered (with
 * its own ActionButton restore forms) and handed in as `content`; this
 * only tracks which one is showing. Defaults to the first tab that
 * actually has something archived, so a manager never lands on an empty
 * "No archived quotations" screen when, say, only Categories has one.
 */
export function ArchiveTabs({ tabs }: { tabs: Tab[] }) {
  const firstNonEmpty = tabs.find((t) => t.count > 0)?.key ?? tabs[0].key;
  const [active, setActive] = useState(firstNonEmpty);
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={
              active === t.key
                ? "rounded-t-md border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-emerald-400"
                : "rounded-t-md px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-b-xl rounded-tr-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {activeTab.content}
      </div>
    </div>
  );
}
