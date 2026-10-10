"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

function parse(iso: string): number {
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.includes("T") ? iso + "Z" : iso.replace(" ", "T") + "Z");
}

/** A moment shown in the viewer's own time zone: "short" is the time today or the day; "full" has the weekday, day and time. */
export function MailTime({ iso, mode = "short", zone }: { iso: string | null | undefined; mode?: "short" | "full"; zone?: string | null }) {
  const t = iso ? parse(iso) : NaN;
  const text = useSyncExternalStore(
    noSubscribe,
    () => {
      if (Number.isNaN(t)) return null;
      const tz = zone || undefined;
      if (mode === "full") return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(t));
      const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
      if (day(t) === day(Date.now())) return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(t));
      const sameYear = day(t).slice(0, 4) === day(Date.now()).slice(0, 4);
      return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(t));
    },
    () => null,
  );
  if (!iso || Number.isNaN(t)) return null;
  return <span suppressHydrationWarning>{text ?? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC"}</span>;
}
