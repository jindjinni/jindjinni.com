"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { resetSidebarMenu, saveSidebarMenu } from "@/app/actions/sidebar-menu";
import { MAX_LABEL, type MenuDept, type ResolvedItem } from "@/lib/sidebar-menu";

// The sidebar every department shares: a colored column down the left with the company name, the department's tabs,
// and (for an Administrator) an "Edit menu" button to rename the tabs and move them up or down. On a phone it
// becomes a scrolling row. The same component serves each department; only the color tone and the list differ.

type Tone = "emerald" | "amber";
const TONES: Record<Tone, { aside: string; faint: string; muted: string; active: string; hover: string; focus: string; field: string }> = {
  emerald: {
    aside: "bg-[var(--dept-accent,#34d399)] text-emerald-950",
    faint: "text-emerald-950/70",
    muted: "text-emerald-950/60",
    active: "bg-emerald-950/15",
    hover: "hover:bg-emerald-950/10",
    focus: "focus-visible:outline-emerald-950",
    field: "border-emerald-950/30 focus:border-emerald-950",
  },
  amber: {
    aside: "bg-[var(--dept-accent,#F7B838)] text-amber-950",
    faint: "text-amber-950/70",
    muted: "text-amber-950/60",
    active: "bg-amber-950/15",
    hover: "hover:bg-amber-950/10",
    focus: "focus-visible:outline-amber-950",
    field: "border-amber-950/30 focus:border-amber-950",
  },
};

type Draft = { id: string; label: string }[];

export function DepartmentSidebar({
  dept,
  tone,
  title,
  orgName,
  items,
  setupLabel,
  defaultSetupLabel,
  canEdit,
  badges = {},
}: {
  dept: MenuDept;
  tone: Tone;
  title: string;
  orgName: string;
  items: ResolvedItem[];
  setupLabel: string;
  defaultSetupLabel: string;
  canEdit: boolean;
  /** A small count on a tab, by tab id (the Mail tab's unread messages). */
  badges?: Record<string, number>;
}) {
  const path = usePathname();
  const router = useRouter();
  const t = TONES[tone];
  const [editing, setEditing] = useState(false);
  const [main, setMain] = useState<Draft>([]);
  const [setup, setSetup] = useState<Draft>([]);
  const [setupName, setSetupName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // The Setup group stays folded until it is clicked, unless you are on one of its pages (so the page you are on shows).
  // A choice made by clicking lasts until you move to another page.
  const [setupChoice, setSetupChoice] = useState<boolean | null>(null);
  const [choicePath, setChoicePath] = useState(path);
  if (choicePath !== path) {
    setChoicePath(path);
    setSetupChoice(null);
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const isActive = (i: ResolvedItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));

  function beginEdit() {
    setMain(items.filter((i) => !i.setup).map((i) => ({ id: i.id, label: i.label })));
    setSetup(items.filter((i) => i.setup).map((i) => ({ id: i.id, label: i.label })));
    setSetupName(setupLabel);
    setError("");
    setEditing(true);
  }

  const move = (list: Draft, set: (d: Draft) => void, index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    set(next);
  };
  const rename = (list: Draft, set: (d: Draft) => void, index: number, label: string) => set(list.map((d, i) => (i === index ? { ...d, label } : d)));

  function save() {
    setError("");
    start(async () => {
      const res = await saveSidebarMenu(dept, { items: [...main, ...setup], setupLabel: setupName });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else setError(res.error);
    });
  }
  function reset() {
    setError("");
    start(async () => {
      const res = await resetSidebarMenu(dept);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  const editRows = (list: Draft, set: (d: Draft) => void) =>
    list.map((d, i) => {
      const meta = byId.get(d.id)!;
      return (
        <div key={d.id} className="flex items-center gap-1" data-testid="menu-edit-row">
          <span className="flex flex-col">
            <button type="button" disabled={i === 0} onClick={() => move(list, set, i, -1)} aria-label={`Move ${meta.label} up`} className={`rounded px-1 text-[10px] leading-4 disabled:opacity-25 ${t.hover}`}>▲</button>
            <button type="button" disabled={i === list.length - 1} onClick={() => move(list, set, i, 1)} aria-label={`Move ${meta.label} down`} className={`rounded px-1 text-[10px] leading-4 disabled:opacity-25 ${t.hover}`}>▼</button>
          </span>
          {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
          <input
            id={`menu-label-${dept}-${d.id}`}
            value={d.label}
            maxLength={MAX_LABEL}
            placeholder={meta.defaultLabel}
            onChange={(e) => rename(list, set, i, e.target.value)}
            aria-label={`Name of the ${meta.defaultLabel} tab`}
            className={`min-w-0 flex-1 rounded-md border bg-white/80 px-2 py-1 text-sm text-slate-900 outline-none ${t.field}`}
          />
        </div>
      );
    });

  const link = (i: ResolvedItem) => {
    const active = isActive(i);
    return (
      <Link
        key={i.id}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${i.setup ? "text-[13px] md:pl-9" : "text-sm"} ${
          active ? `${t.active} font-semibold` : `font-medium ${t.hover}`
        } focus-visible:outline focus-visible:outline-2 ${t.focus}`}
      >
        {i.icon && <span aria-hidden="true">{i.icon}</span>}
        {i.label}
        {(badges[i.id] ?? 0) > 0 && (
          <span className={`ml-auto rounded-full ${t.active} px-2 py-0.5 text-xs font-semibold tabular-nums`} data-testid={`badge-${i.id}`} title="Unread">
            {badges[i.id] > 99 ? "99+" : badges[i.id]}
          </span>
        )}
      </Link>
    );
  };

  const mainItems = items.filter((i) => !i.setup);
  const setupItems = items.filter((i) => i.setup);
  const setupOpen = setupChoice ?? setupItems.some(isActive);

  return (
    <aside className={`shrink-0 md:w-56 print:hidden ${t.aside}`}>
      <div className="px-5 pb-3 pt-5 md:pt-6">
        <p className={`text-xs font-semibold uppercase tracking-wider ${t.faint}`}>{title}</p>
        <p className="mt-1 text-lg font-bold leading-tight">{orgName}</p>
      </div>

      {editing ? (
        <div className="flex flex-col gap-1.5 px-3 pb-4" aria-label={`${title} menu editor`}>
          <p className={`px-1 pb-1 text-xs ${t.faint}`}>Type a new name, or move a tab up or down. This changes the menu for everyone in your company.</p>
          {editRows(main, setMain)}
          {setup.length > 0 && (
            <>
              <input
                id={`menu-setup-label-${dept}`}
                value={setupName}
                maxLength={MAX_LABEL}
                placeholder={defaultSetupLabel}
                onChange={(e) => setSetupName(e.target.value)}
                aria-label="Name of the group of setup tabs"
                className={`mt-2 min-w-0 rounded-md border bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-900 outline-none ${t.field}`}
              />
              {editRows(setup, setSetup)}
            </>
          )}
          {error && <p role="alert" className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">{error}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60">
              {pending ? "Saving…" : "Save menu"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${t.hover}`}>
              Cancel
            </button>
          </div>
          <button type="button" onClick={reset} disabled={pending} className={`self-start rounded-lg px-1 py-1 text-xs underline ${t.faint}`}>
            Put the original names and order back
          </button>
        </div>
      ) : (
        <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:items-stretch md:pb-3" aria-label={`${title} sections`}>
          {mainItems.map(link)}
          {setupItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setSetupChoice(!setupOpen)}
                aria-expanded={setupOpen}
                aria-controls={`sidebar-setup-${dept}`}
                data-testid="setup-toggle"
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider md:mt-2 ${t.muted} ${t.hover} focus-visible:outline focus-visible:outline-2 ${t.focus}`}
              >
                <span aria-hidden="true" className={`text-[9px] transition-transform ${setupOpen ? "rotate-90" : ""}`}>▶</span>
                {setupLabel}
              </button>
              {setupOpen && (
                <div id={`sidebar-setup-${dept}`} className="flex items-center gap-1 md:flex-col md:items-stretch">
                  {setupItems.map(link)}
                </div>
              )}
            </>
          )}
        </nav>
      )}

      {canEdit && !editing && (
        <div className="hidden px-3 pb-6 md:block">
          <button type="button" onClick={beginEdit} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${t.muted} ${t.hover}`}>
            ✏️ Edit menu
          </button>
        </div>
      )}
    </aside>
  );
}
