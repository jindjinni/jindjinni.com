"use client";

import { useState, useTransition } from "react";
import { saveDashboardLayout } from "@/app/actions/dashboard-layout";
import { accountsMini, attentionNotes, purchasingMini, receivingMini } from "@/lib/analytics-mini";
import { moveSection, setAllOpen, toggleOpen, defaultLayout, visibleOrder, type Layout, type SectionId } from "@/lib/dashboard-layout";
import { PERIODS, PERIOD_WORDS, type Period } from "@/lib/home-rules";
import type { Pulse } from "@/lib/home-stats";
import { AccountsBody, PurchasingBody, ReceivingBody } from "./analytics-board";
import { HomeSection, MiniBar, type Chip } from "./home-section";

type Props = {
  /** The industry news section: its summary chips, its short preview, and the full content. */
  newsChips: Chip[];
  newsPreview: string[];
  news: React.ReactNode;
  /** Present only for the owner and admins. */
  pulse: Pulse | null;
  initialLayout: Layout;
  /** True while a platform person only looks at a company: nothing can be saved then. */
  readOnly: boolean;
};

const NAMES: Record<SectionId, string> = { news: "Industry news", purchasing: "Purchasing", receiving: "Receiving", accounts: "Accounts" };

/**
 * The Home screen's sections, in the order this person chose, each one closed or open. The open/closed state and the order are
 * saved for the person (per company), so the screen looks the same next time and on their other devices.
 */
export function HomeBoard({ newsChips, newsPreview, news, pulse, initialLayout, readOnly }: Props) {
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [period, setPeriod] = useState<Period>("week");
  const [arranging, setArranging] = useState(false);
  const [, startSave] = useTransition();

  const available: SectionId[] = pulse ? ["news", "purchasing", "receiving", "accounts"] : ["news"];
  const shown = visibleOrder(layout, available);

  const change = (next: Layout) => {
    setLayout(next);
    if (!readOnly) startSave(() => void saveDashboardLayout(next).catch(() => undefined));
  };

  const allOpen = shown.every((id) => layout.open.includes(id));
  const attention = pulse ? attentionNotes(pulse) : [];

  const controlsFor = (id: SectionId) => {
    if (!arranging) return null;
    const at = shown.indexOf(id);
    const btn = "flex h-7 w-8 items-center justify-center rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
    return (
      <span className="flex shrink-0 flex-col gap-1 py-2 pr-3" data-testid={`arrange-${id}`}>
        <button type="button" className={btn} disabled={at <= 0} onClick={() => change(moveSection(layout, id, -1, available))} aria-label={`Move ${NAMES[id]} up`} data-testid={`move-up-${id}`}>
          ↑
        </button>
        <button type="button" className={btn} disabled={at >= shown.length - 1} onClick={() => change(moveSection(layout, id, 1, available))} aria-label={`Move ${NAMES[id]} down`} data-testid={`move-down-${id}`}>
          ↓
        </button>
      </span>
    );
  };

  const common = (id: SectionId) => ({ id, open: layout.open.includes(id), onToggle: () => change(toggleOpen(layout, id)), controls: controlsFor(id) });

  const section = (id: SectionId) => {
    if (id === "news") {
      return (
        <HomeSection key={id} {...common(id)} title="Industry news" blurb="Recalls, safety notices and new products from the makers of the brands we buy." chips={newsChips} preview={newsPreview}>
          {news}
        </HomeSection>
      );
    }
    if (!pulse) return null;
    if (id === "purchasing") {
      const m = purchasingMini(pulse, period);
      return (
        <HomeSection key={id} {...common(id)} dot="bg-emerald-500" title="Purchasing" blurb="Quotations given and how far they got" chips={m.chips} mini={<MiniBar segments={m.bar} />}>
          <PurchasingBody pulse={pulse} period={period} />
        </HomeSection>
      );
    }
    if (id === "receiving") {
      const m = receivingMini(pulse, period);
      return (
        <HomeSection key={id} {...common(id)} dot="bg-amber-500" title="Receiving" blurb="Packages coming in and being checked" chips={m.chips} mini={<MiniBar segments={m.bar} />}>
          <ReceivingBody pulse={pulse} period={period} />
        </HomeSection>
      );
    }
    const m = accountsMini(pulse, period);
    return (
      <HomeSection key={id} {...common(id)} dot="bg-sky-500" title="Accounts" blurb="What is due, overdue and paid" chips={m.chips} mini={<MiniBar segments={m.bar} />}>
        <AccountsBody pulse={pulse} period={period} />
      </HomeSection>
    );
  };

  const small = "rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="mt-4" data-testid="home-board">
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="home-toolbar">
        <div className="flex min-w-0 flex-wrap gap-1.5" data-testid="analytics-attention">
          {pulse &&
            (attention.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                <span aria-hidden="true">✓</span> Nothing needs attention right now
              </span>
            ) : (
              attention.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                  <span aria-hidden="true">!</span> {a}
                </span>
              ))
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pulse && (
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Time period for the numbers">
              {PERIODS.map((x) => (
                <button key={x.key} type="button" onClick={() => setPeriod(x.key)} aria-pressed={period === x.key} data-testid={`period-${x.key}`} title={`Show the numbers for ${PERIOD_WORDS[x.key]}`} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${period === x.key ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {shown.length > 1 && (
            <button type="button" className={small} onClick={() => change(setAllOpen(layout, available, !allOpen))} data-testid="toggle-all">
              {allOpen ? "Close all" : "Open all"}
            </button>
          )}
          {shown.length > 1 && !readOnly && (
            <button type="button" className={`${small} ${arranging ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : ""}`} aria-pressed={arranging} onClick={() => setArranging((a) => !a)} data-testid="customize">
              {arranging ? "Done" : "Customize"}
            </button>
          )}
        </div>
      </div>

      {arranging && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100" role="status" data-testid="customize-hint">
          Use the arrows to move a section up or down. It is saved for you automatically.
          <button type="button" className="font-semibold underline" onClick={() => change({ ...defaultLayout(), open: layout.open })} data-testid="reset-order">
            Put them back in the usual order
          </button>
        </p>
      )}

      <div className="mt-3 space-y-3">{shown.map((id) => section(id))}</div>
    </div>
  );
}
