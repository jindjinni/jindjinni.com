"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tickMailAction } from "@/app/actions/mailbox";

/**
 * While the Mail tab is open it sends this company's scheduled emails that have come due and checks for new incoming mail (once a
 * minute), so both happen on time even though the hosting plan's own scheduler only runs once a day. Shows nothing.
 */
export function MailTick({ dept, everyMs = 60_000 }: { dept: string; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const run = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await tickMailAction(dept);
        if (!stop && (r.sent > 0 || r.received > 0)) router.refresh();
      } catch {
        // The next minute tries again.
      }
    };
    void run();
    const id = window.setInterval(run, everyMs);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [router, everyMs, dept]);
  return null;
}
