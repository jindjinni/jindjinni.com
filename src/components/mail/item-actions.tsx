"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { discardAction, markUnreadAction, sendNowAction, unscheduleAction, type MailState } from "@/app/actions/mailbox";
import { ghostBtn, primaryBtn } from "@/components/sales-ui";

type Which = "send" | "unschedule" | "discard";

/** The buttons on a draft, a scheduled email or a failed one: send now, move back to drafts, discard. */
export function OutboxButtons({ dept, boxId, id, status, canSend }: { dept: string; boxId: string; id: string; status: string; canSend: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; notice?: string }>({});
  if (!canSend) return null;

  function run(which: Which) {
    if (which === "discard" && !window.confirm("Discard this email? It will be moved out of sight.")) return;
    setMsg({});
    start(async () => {
      const fn: Promise<MailState> = which === "send" ? sendNowAction(dept, boxId, id) : which === "unschedule" ? unscheduleAction(dept, boxId, id) : discardAction(dept, boxId, id);
      const r = await fn;
      if (r.error) setMsg({ error: r.error });
      else {
        const folder = which === "send" ? "sent" : which === "unschedule" ? "drafts" : "drafts";
        router.push(`/dashboard/${dept}/mail?box=${boxId}&folder=${folder}&done=${which === "send" ? "sent" : "saved"}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2" data-testid="outbox-buttons">
      <div className="flex flex-wrap gap-2">
        {status !== "SENDING" && status !== "SENT" && (
          <button type="button" className={primaryBtn} disabled={pending} onClick={() => run("send")} data-testid="send-now">
            {pending ? "Working…" : "Send now"}
          </button>
        )}
        {(status === "SCHEDULED" || status === "FAILED") && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={() => run("unschedule")} data-testid="unschedule">
            Cancel the schedule (back to Drafts)
          </button>
        )}
        {status !== "SENDING" && status !== "SENT" && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={() => run("discard")} data-testid="discard">
            Discard
          </button>
        )}
      </div>
      {msg.error && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert" data-testid="outbox-error">
          {msg.error}
        </p>
      )}
    </div>
  );
}

/** On a received email: put the conversation back to unread and return to the Inbox. */
export function MarkUnreadButton({ dept, boxId, id }: { dept: string; boxId: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span>
      <button
        type="button"
        className={ghostBtn}
        disabled={pending}
        data-testid="mark-unread"
        onClick={() =>
          start(async () => {
            const r = await markUnreadAction(dept, boxId, id);
            if (r.error) setError(r.error);
            else {
              router.push(`/dashboard/${dept}/mail?box=${boxId}&folder=inbox`);
              router.refresh();
            }
          })
        }
      >
        Mark as unread
      </button>
      {error && <span className="ml-2 text-sm text-red-700 dark:text-red-400" role="alert">{error}</span>}
    </span>
  );
}
