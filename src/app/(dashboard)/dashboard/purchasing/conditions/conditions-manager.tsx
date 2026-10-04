"use client";

import { useMemo, useState } from "react";
import { createPurchasingCondition } from "@/app/actions/purchasing";
import { ConditionCard, type Condition } from "./condition-card";
import { LoadConditionCatalogButton } from "./load-condition-catalog-button";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Tab = "manage" | "archived";

export function ConditionsManager({ conditions }: { conditions: Condition[] }) {
  const [tab, setTab] = useState<Tab>("manage");
  const [search, setSearch] = useState("");

  const active = conditions.filter((c) => c.active);
  const archived = conditions.filter((c) => !c.active);
  const visible = tab === "manage" ? active : archived;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((c) => c.name.toLowerCase().includes(q));
  }, [visible, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        <TabButton active={tab === "manage"} onClick={() => setTab("manage")}>
          Manage Conditions ({active.length})
        </TabButton>
        <TabButton active={tab === "archived"} onClick={() => setTab("archived")}>
          Archived ({archived.length})
        </TabButton>
      </div>

      {tab === "manage" && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add New Condition Type</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create a product condition for pricing.</p>
            </div>
            <form action={createPurchasingCondition} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Condition name
                <input name="name" required placeholder="e.g. Mint, Ding, Damaged" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                Price multiplier
                <input name="multiplier" type="number" step="0.01" min="0" defaultValue="1" className={inputClass} />
              </label>
              <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
                + Add Condition
              </button>
            </form>
            <div className="border-t border-dashed border-slate-200 pt-4 dark:border-slate-700">
              <LoadConditionCatalogButton />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Existing Conditions</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {active.length} condition type{active.length === 1 ? "" : "s"} configured
                </p>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conditions..."
                className={`w-56 ${inputClass}`}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filtered.map((c) => (
                <ConditionCard key={c.id} condition={c} />
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-slate-400">
                  {active.length === 0 ? "No conditions yet -- add one on the left." : "No matches for that search."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "archived" && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Archived Conditions</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No longer offered on new quoted lines. Restore to bring one back.</p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conditions..."
              className={`w-56 ${inputClass}`}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filtered.map((c) => (
              <ConditionCard key={c.id} condition={c} />
            ))}
            {filtered.length === 0 && <p className="text-sm text-slate-400">Nothing archived.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "border-b-2 border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
          : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      }
    >
      {children}
    </button>
  );
}
