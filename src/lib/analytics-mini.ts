// The small summaries shown on a closed Home section: a few numbers as chips and one thin bar. Pure; reads nothing.

import { pct } from "@/lib/analytics-rules";
import { money, plural, PERIOD_WORDS, type Period } from "@/lib/home-rules";
import type { Pulse } from "@/lib/home-stats";

export type MiniChip = { text: string; tone: "red" | "amber" | "green" | "slate" };
export type MiniKind = "good" | "critical" | "serious" | "warning" | "neutral" | "blueLight" | "blue" | "blueDark";
export type MiniSegment = { key: string; label: string; n: number; kind: MiniKind };

/** What needs a person's attention right now, in words (empty when nothing does). */
export function attentionNotes(pulse: Pulse): string[] {
  const n = pulse.now;
  return [
    n.accounts.overdue > 0 ? `${plural(n.accounts.overdue, "order")} overdue` : "",
    n.accounts.dueToday > 0 ? `${plural(n.accounts.dueToday, "order")} due today` : "",
    n.purchasing.shippingTrouble > 0 ? `${plural(n.purchasing.shippingTrouble, "package")} with a shipping problem` : "",
    n.receiving.waitingForDecision > 0 ? `${plural(n.receiving.waitingForDecision, "shipment")} waiting for a decision` : "",
  ].filter(Boolean);
}

export function purchasingMini(pulse: Pulse, period: Period): { chips: MiniChip[]; bar: MiniSegment[] } {
  const when = PERIOD_WORDS[period];
  const f = pulse.periods[period].purchasing.funnel;
  const chips: MiniChip[] = [{ text: `${plural(f.given, "quotation")} ${when}`, tone: "slate" }];
  if (f.given > 0) chips.push({ text: `${pct(f.fullProcess, f.given)}% full process`, tone: "slate" });
  chips.push({ text: `${f.successful} successful`, tone: f.successful > 0 ? "green" : "slate" });
  chips.push({ text: `${f.unsuccessful} unsuccessful`, tone: f.unsuccessful > 0 ? "red" : "slate" });
  return {
    chips,
    bar: [
      { key: "successful", label: "Successful", n: f.successful, kind: "good" },
      { key: "unsuccessful", label: "Unsuccessful", n: f.unsuccessful, kind: "critical" },
      { key: "inProgress", label: "In progress", n: f.inProgress, kind: "neutral" },
    ],
  };
}

export function receivingMini(pulse: Pulse, period: Period): { chips: MiniChip[]; bar: MiniSegment[] } {
  const when = PERIOD_WORDS[period];
  const p = pulse.periods[period];
  const r = pulse.now.receiving;
  const queue = r.waitingToOpen + r.inProgress;
  return {
    chips: [
      { text: `${p.purchasing.delivered} delivered ${when}`, tone: "slate" },
      { text: `${p.receiving.received} received ${when}`, tone: "slate" },
      queue > 0 ? { text: `${plural(queue, "package")} in the queue`, tone: "amber" } : { text: "Queue is empty", tone: "green" },
    ],
    bar: [
      { key: "onTheWay", label: "On the way", n: r.onTheWay, kind: "blueLight" },
      { key: "waiting", label: "Delivered, not started", n: r.waitingToOpen, kind: "warning" },
      { key: "inProgress", label: "Being received", n: r.inProgress, kind: "blue" },
    ],
  };
}

export function accountsMini(pulse: Pulse, period: Period): { chips: MiniChip[]; bar: MiniSegment[] } {
  const when = PERIOD_WORDS[period];
  const a = pulse.now.accounts;
  const b = a.buckets;
  const chips: MiniChip[] = [a.overdue > 0 ? { text: `${plural(a.overdue, "order")} overdue (${money(a.overdueValue)})`, tone: "red" } : { text: "Nothing overdue", tone: "green" }];
  if (a.dueToday > 0) chips.push({ text: `${plural(a.dueToday, "order")} due today`, tone: "amber" });
  chips.push({ text: `${plural(a.toPay, "order")} to be paid (${money(a.toPayValue)})`, tone: "slate" });
  chips.push({ text: `${pulse.periods[period].accounts.paid} paid ${when}`, tone: "slate" });
  return {
    chips,
    bar: [
      { key: "overdue", label: "Overdue", n: b.overdueLong.count + b.overdue.count, kind: "critical" },
      { key: "today", label: "Due today", n: b.today.count, kind: "warning" },
      { key: "soon", label: "Due later", n: b.tomorrow.count + b.later.count, kind: "blue" },
      { key: "noDay", label: "No due day yet", n: b.noDay.count, kind: "neutral" },
    ],
  };
}
