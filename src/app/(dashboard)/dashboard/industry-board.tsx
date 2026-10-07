"use client";

// The Home screen's industry watch: an "attention" strip with the serious recent items, then every brand the company
// buys as one closed, expandable line (with its counts) that opens to its stories. A search or a filter opens the brands
// that match. Stories link out to the original page.

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshIndustryNews, type RefreshState } from "@/app/actions/industry";
import { KIND_LABEL, ORIGIN_LABEL, SEVERITY_LABEL, ago, type BrandNews, type NewsKind, type Severity, type ShownStory } from "@/lib/industry-rules";

type Filter = "all" | "urgent" | NewsKind;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "urgent", label: "Urgent only" },
  { key: "recall", label: "Recalls" },
  { key: "safety", label: "Safety notices" },
  { key: "business", label: "Business" },
  { key: "product", label: "New products" },
];

const PILL: Record<Severity, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  important: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function Story({ s, now, showBrand }: { s: ShownStory; now: Date; showBrand?: boolean }) {
  return (
    <li className="px-4 py-3" data-testid="industry-story">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${PILL[s.severity]}`}>{SEVERITY_LABEL[s.severity]}</span>
        <span className="font-medium text-slate-600 dark:text-slate-300">{KIND_LABEL[s.kind]}</span>
        {s.origin && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" data-testid="industry-origin">
            {ORIGIN_LABEL[s.origin]}
          </span>
        )}
        {showBrand && <span className="rounded-full bg-slate-900 px-2 py-0.5 font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{s.brand}</span>}
        <span className="text-slate-500">
          {s.source ? `${s.source} · ` : ""}
          {ago(s.publishedAt, now)}
        </span>
      </div>
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-semibold text-slate-900 hover:text-emerald-700 hover:underline dark:text-slate-50 dark:hover:text-emerald-300">
        {s.title}
      </a>
      {s.summary && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{s.summary}</p>}
    </li>
  );
}

export function RefreshButton({ label = "Refresh now" }: { label?: string }) {
  const router = useRouter();
  const [state, run, pending] = useActionState<RefreshState | null, FormData>(async () => {
    const r = await refreshIndustryNews();
    router.refresh();
    return r;
  }, null);
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} data-testid="industry-refresh" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
        {pending ? "Checking the news…" : label}
      </button>
      {state && (
        <span role="status" className={`text-sm ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}

export function IndustryBoard({ groups, attention, nowIso, updating }: { groups: BrandNews[]; attention: ShownStory[]; nowIso: string; updating: boolean }) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // A background refresh was started when this page opened: look again once it has had time to finish.
  useEffect(() => {
    if (!updating) return;
    const t = setTimeout(() => router.refresh(), 30_000);
    return () => clearTimeout(t);
  }, [updating, router]);

  const needle = q.trim().toLowerCase();
  const searching = needle !== "" || filter !== "all";
  const shown = useMemo(
    () =>
      groups.map((g) => {
        const stories = g.stories.filter((s) => (filter === "all" || (filter === "urgent" ? s.severity === "urgent" : s.kind === filter)) && (!needle || `${s.title} ${s.summary ?? ""} ${s.source} ${s.brand} ${g.owner}`.toLowerCase().includes(needle)));
        return { ...g, stories };
      }),
    [groups, filter, needle],
  );
  const visible = searching ? shown.filter((g) => g.stories.length > 0) : shown;

  return (
    <div className="mt-6">
      {attention.length > 0 && (
        <section aria-labelledby="attn" className="rounded-xl border border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30" data-testid="industry-attention">
          <h2 id="attn" className="px-4 pt-3 text-sm font-bold text-red-900 dark:text-red-200">
            Needs your attention ({attention.length})
          </h2>
          <ul className="divide-y divide-red-100 dark:divide-red-900/60">
            {attention.map((s) => (
              <Story key={s.id} s={s} now={now} showBrand />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="industry-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Search the news
          </label>
          <input id="industry-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Brand, product, word in a headline" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="industry-search" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={`rounded-full px-3 py-1.5 text-sm font-medium ${filter === f.key ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2" data-testid="industry-brands">
        {visible.map((g) => {
          const isOpen = searching ? true : !!open[g.brand];
          return (
            <section key={g.brand} className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="industry-brand">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.brand]: !o[g.brand] }))} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                  <span aria-hidden="true" className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                  {g.brand}
                  {g.owner && g.owner.toLowerCase() !== g.brand.toLowerCase() && <span className="text-sm font-normal text-slate-500" data-testid="industry-owner">made by {g.owner}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  {g.urgent > 0 && <span className={`rounded-full px-2 py-0.5 font-semibold ${PILL.urgent}`}>{g.urgent} urgent</span>}
                  {g.important > 0 && <span className={`rounded-full px-2 py-0.5 font-semibold ${PILL.important}`}>{g.important} important</span>}
                  <span className="text-slate-500">{g.total === 0 ? "Nothing new" : `${g.total} ${g.total === 1 ? "story" : "stories"}`}</span>
                </span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {g.stories.length === 0 ? <li className="px-4 py-3 text-sm text-slate-500">Nothing new about {g.brand} in the last few months.</li> : g.stories.map((s) => <Story key={s.id} s={s} now={now} />)}
                </ul>
              )}
            </section>
          );
        })}
        {searching && visible.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">No stories match. Clear the search or choose Everything.</p>}
      </div>
    </div>
  );
}
