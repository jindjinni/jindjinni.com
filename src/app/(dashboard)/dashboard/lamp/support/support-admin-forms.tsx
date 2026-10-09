"use client";

import { useActionState, useState } from "react";
import { startViewAsCompany, supportNote, supportReply, supportSetStatus, type SupportState } from "@/app/actions/support";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const btn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const btnGhost = "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

function Feedback({ state }: { state: SupportState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-emerald-700 dark:text-emerald-400" data-testid="admin-ok">{state.message}</p>;
  return null;
}

export function ReplyAsSupportForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(supportReply, undefined);
  const [body, setBody] = useState("");
  // Empty the box once a send went through (derived during render, as React recommends, instead of in an effect).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) setBody("");
  }
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="admin-reply-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="adm-reply" className="text-xs font-medium text-slate-600 dark:text-slate-400">Reply to the company (they see this and get an email)</label>
      <textarea id="adm-reply" name="body" required rows={5} maxLength={5000} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" name="solve" data-testid="reply-solve" /> This solves it (mark as solved)
      </label>
      <div><button className={btn} disabled={pending} data-testid="admin-send-reply">{pending ? "Sending..." : "Send reply"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function NoteForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(supportNote, undefined);
  const [body, setBody] = useState("");
  // Empty the box once a send went through (derived during render, as React recommends, instead of in an effect).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) setBody("");
  }
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="admin-note-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="adm-note" className="text-xs font-medium text-slate-600 dark:text-slate-400">Internal note (only you see this)</label>
      <textarea id="adm-note" name="body" required rows={3} maxLength={5000} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
      <div><button className={btnGhost} disabled={pending} data-testid="admin-save-note">{pending ? "Saving..." : "Save note"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function StatusForm({ ticketId, status, priority }: { ticketId: string; status: string; priority: string }) {
  const [state, action, pending] = useActionState(supportSetStatus, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="admin-status-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="adm-status" className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
        <select id="adm-status" name="status" defaultValue={status} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="open">Needs us</option>
          <option value="waiting">Waiting on company</option>
          <option value="solved">Solved</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="adm-priority" className="text-xs font-medium text-slate-600 dark:text-slate-400">Priority</label>
        <select id="adm-priority" name="priority" defaultValue={priority} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>
      <button className={btnGhost} disabled={pending} data-testid="admin-set-status">{pending ? "Saving..." : "Update"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function ViewAsButton({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(startViewAsCompany, undefined);
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="view-as-form">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div><button className={btn} disabled={pending} data-testid="view-as-start">{pending ? "Opening..." : "View as company (read-only, 30 min)"}</button></div>
      <Feedback state={state} />
    </form>
  );
}
