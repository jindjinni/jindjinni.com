"use client";

import { useActionState, useState } from "react";
import { allowSupportView, replyToTicket, sendTicket, takeBackSupportView, type SupportState } from "@/app/actions/support";
import { CATEGORIES, CONSENT_CHOICES } from "@/lib/support-rules";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const btn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const btnGhost = "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

function Feedback({ state }: { state: SupportState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-emerald-700 dark:text-emerald-400" data-testid="support-ok">{state.message}</p>;
  return null;
}

/** Start a new ticket. Owners and admins may also allow support to look at the account (read-only) right away. */
export function NewTicketForm({ canAllowView }: { canAllowView: boolean }) {
  const [state, action, pending] = useActionState(sendTicket, undefined);
  // Controlled so a failed send (for example "title too short") keeps what the person typed.
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [allow, setAllow] = useState(false);
  const [days, setDays] = useState("3");
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="new-ticket-form">
      <div className="flex flex-col gap-1">
        <label htmlFor="tk-subject" className="text-xs font-medium text-slate-600 dark:text-slate-400">Short title</label>
        <input id="tk-subject" name="subject" required maxLength={150} className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="For example: I can't print a quotation" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="tk-category" className="text-xs font-medium text-slate-600 dark:text-slate-400">What is it about?</label>
        <select id="tk-category" name="category" className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="tk-body" className="text-xs font-medium text-slate-600 dark:text-slate-400">Tell us what happened</label>
        <textarea id="tk-body" name="body" required rows={6} maxLength={5000} className={input} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What were you trying to do, and what did you see instead?" />
      </div>
      {canAllowView && (
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
            <input type="checkbox" name="allowView" checked={allow} onChange={(e) => setAllow(e.target.checked)} className="mt-1" data-testid="allow-view-checkbox" />
            <span>
              Allow Jindjinni Support to look at my account to help (read-only)
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                Support sees what you see but can&apos;t change anything. Each look lasts at most 30 minutes, you will see it listed in your Support access log, and you can take your permission back at any time.
              </span>
            </span>
          </label>
          {allow && (
            <div className="mt-2 flex items-center gap-2 pl-6 text-sm">
              <label htmlFor="tk-days" className="text-slate-600 dark:text-slate-400">Permission lasts</label>
              <select id="tk-days" name="viewDays" value={days} onChange={(e) => setDays(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950">
                {CONSENT_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div><button className={btn} disabled={pending} data-testid="send-ticket">{pending ? "Sending..." : "Send to Support"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(replyToTicket, undefined);
  const [body, setBody] = useState("");
  // Empty the box once a send went through (derived during render, as React recommends, instead of in an effect).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) setBody("");
  }
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="reply-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="tk-reply" className="text-xs font-medium text-slate-600 dark:text-slate-400">Write back</label>
      <textarea id="tk-reply" name="body" required rows={4} maxLength={5000} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
      <div><button className={btn} disabled={pending} data-testid="send-reply">{pending ? "Sending..." : "Send"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function AllowViewForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(allowSupportView, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="allow-view-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="av-days" className="text-xs font-medium text-slate-600 dark:text-slate-400">Permission lasts</label>
        <select id="av-days" name="days" defaultValue="3" className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          {CONSENT_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
        </select>
      </div>
      <button className={btn} disabled={pending} data-testid="allow-view">{pending ? "Saving..." : "Allow support to look (read-only)"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function TakeBackForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(takeBackSupportView, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid="takeback-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <button className={btnGhost} disabled={pending} data-testid="take-back">{pending ? "Saving..." : "Take my permission back"}</button>
      <Feedback state={state} />
    </form>
  );
}
