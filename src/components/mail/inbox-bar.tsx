"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllReadAction, refreshMailboxAction } from "@/app/actions/mailbox";
import { MailTime } from "@/components/mail/mail-time";
import { ghostBtn } from "@/components/sales-ui";

/** Above the Inbox: when it was last checked, a Refresh button, and "Mark all as read". The Inbox also checks by itself every minute. */
export function InboxBar({ dept, boxId, lastSyncAt, lastSyncError, canRefresh, unread }: { dept: string; boxId: string; lastSyncAt: string | null; lastSyncError: string | null; canRefresh: boolean; unread: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; notice?: string }>({});

  function refresh() {
    setMsg({});
    start(async () => {
      const r = await refreshMailboxAction(dept, boxId);
      setMsg(r.error ? { error: r.error } : { notice: r.notice });
      router.refresh();
    });
  }
  function readAll() {
    setMsg({});
    start(async () => {
      const r = await markAllReadAction(dept, boxId);
      setMsg(r.error ? { error: r.error } : { notice: r.notice });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2" data-testid="inbox-bar">
      <div className="flex flex-wrap items-center gap-2">
        {canRefresh && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={refresh} data-testid="refresh-inbox">
            {pending ? "Checking…" : "Refresh"}
          </button>
        )}
        {unread > 0 && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={readAll} data-testid="mark-all-read">
            Mark all as read
          </button>
        )}
        {canRefresh && (
          <span className="text-xs text-slate-500 dark:text-slate-400" data-testid="last-checked">
            {lastSyncAt ? (
              <>
                Last checked <MailTime iso={lastSyncAt} mode="short" />
              </>
            ) : (
              "Not checked yet"
            )}
          </span>
        )}
        {msg.notice && (
          <span className="text-sm text-emerald-800 dark:text-emerald-300" role="status" data-testid="inbox-notice">
            {msg.notice}
          </span>
        )}
      </div>
      {(msg.error || lastSyncError) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" role="alert" data-testid="inbox-error">
          {msg.error || lastSyncError}
        </p>
      )}
    </div>
  );
}
