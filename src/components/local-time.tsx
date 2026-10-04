"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** A system time stamp ("YYYY-MM-DD HH:MM:SS", stored in UTC) shown in the viewer's own time zone. */
export function LocalTime({ value, empty = "—" }: { value: string | null | undefined; empty?: string }) {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(value) : null;
  // On the server (and during hydration) there is no time zone to use, so UTC is shown; the browser then swaps in local time.
  const local = useSyncExternalStore(
    noSubscribe,
    () => (m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : null),
    () => null,
  );
  if (!m) return <>{empty}</>;
  return <span suppressHydrationWarning>{local ?? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`}</span>;
}
