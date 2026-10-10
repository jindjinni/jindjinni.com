"use client";

import { useActionState, useTransition } from "react";
import { hideAuditorAction, saveAuditorAction, type DirectoryState } from "@/app/actions/audit-directory";
import { AUDITOR_KINDS, AUDITOR_KIND_LABEL } from "@/lib/audit-insights";
import { field, ghostBtn, primaryBtn } from "@/components/sales-ui";

const label = "block text-sm font-medium text-slate-800 dark:text-slate-100";

export type AuditorValues = { id: string | null; kind: string; name: string; company: string; email: string; phone: string; notes: string };

/** Add or change one auditor / agency. */
export function AuditorForm({ v, canWork, onDoneLabel }: { v: AuditorValues; canWork: boolean; onDoneLabel?: string }) {
  const [state, action, pending] = useActionState<DirectoryState, FormData>(saveAuditorAction.bind(null, v.id), undefined);
  const k = v.id ?? "new";
  // After a refusal React clears the boxes; the server sends back what was typed so nothing has to be retyped.
  const t = state?.values ?? { kind: v.kind, name: v.name, company: v.company, email: v.email, phone: v.phone, notes: v.notes };
  return (
    <form key={state?.values ? "again" : "first"} action={action} className="space-y-3" data-testid={v.id ? "auditor-edit-form" : "auditor-new-form"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`kind-${k}`} className={label}>Kind</label>
          <select id={`kind-${k}`} name="kind" defaultValue={t.kind} className={`${field} mt-1`} disabled={!canWork} data-testid="dir-kind">
            {AUDITOR_KINDS.map((x) => <option key={x} value={x}>{AUDITOR_KIND_LABEL[x]}</option>)}
          </select>
        </div>
        <div><label htmlFor={`company-${k}`} className={label}>Company / agency</label><input id={`company-${k}`} name="company" defaultValue={t.company} className={`${field} mt-1`} disabled={!canWork} data-testid="dir-company" /></div>
        <div><label htmlFor={`name-${k}`} className={label}>Contact name</label><input id={`name-${k}`} name="name" defaultValue={t.name} className={`${field} mt-1`} disabled={!canWork} data-testid="dir-name" /></div>
        <div><label htmlFor={`email-${k}`} className={label}>Email</label><input id={`email-${k}`} name="email" type="email" defaultValue={t.email} className={`${field} mt-1`} disabled={!canWork} data-testid="dir-email" /></div>
        <div><label htmlFor={`phone-${k}`} className={label}>Phone</label><input id={`phone-${k}`} name="phone" defaultValue={t.phone} className={`${field} mt-1`} disabled={!canWork} data-testid="dir-phone" /></div>
      </div>
      <div><label htmlFor={`notes-${k}`} className={label}>Notes</label><textarea id={`notes-${k}`} name="notes" defaultValue={t.notes} rows={2} maxLength={1000} className={`${field} mt-1`} disabled={!canWork} data-testid="dir-notes" /></div>
      {canWork && (
        <div className="flex flex-wrap items-center gap-3">
          <button className={primaryBtn} disabled={pending} data-testid="dir-save">{pending ? "Saving…" : onDoneLabel ?? "Save"}</button>
          {state?.error && <p className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="dir-error">{state.error}</p>}
          {state?.message && <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status" data-testid="dir-message">{state.message}</p>}
        </div>
      )}
    </form>
  );
}

/** Hide or bring back an entry. Nothing is ever deleted. */
export function HideButton({ id, hidden }: { id: string; hidden: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={ghostBtn} disabled={pending} onClick={() => start(async () => { await hideAuditorAction(id, !hidden); })} data-testid={hidden ? "dir-restore" : "dir-hide"}>
      {hidden ? "Bring back" : "Hide"}
    </button>
  );
}
