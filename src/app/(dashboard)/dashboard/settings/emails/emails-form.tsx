"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveEmailSetupAction, type EmailSetupState } from "@/app/actions/email-setup";
import { field, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type EmailRowView = {
  dept: string;
  label: string;
  blurb: string;
  mailboxId: string | null;
  planned: string | null;
  accountEmail: string | null;
  status: "NOT_CONNECTED" | "ACTIVE" | "NEEDS_RECONNECT";
  suggested: string;
};

const PILL = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  NEEDS_RECONNECT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  NOT_CONNECTED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
} as const;

function pillText(r: EmailRowView) {
  if (r.status === "ACTIVE") return "Connected";
  if (r.status === "NEEDS_RECONNECT") return "Needs reconnecting";
  return r.planned ? "Saved, not connected yet" : "No address yet";
}

export function EmailsForm({ rows, mailOn }: { rows: EmailRowView[]; mailOn: boolean }) {
  const [state, action, pending] = useActionState<EmailSetupState, FormData>(saveEmailSetupAction, {});
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.dept, r.accountEmail ?? r.planned ?? ""])));
  return (
    <form action={action} className="mt-6 space-y-4" data-testid="emails-form">
      {rows.map((r) => {
        const locked = r.status === "ACTIVE";
        const id = `email-${r.dept}`;
        return (
          <section key={r.dept} data-testid={`email-row-${r.dept}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{r.label}</h3>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{r.blurb}</p>
              </div>
              <span data-testid={`email-status-${r.dept}`} className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[r.status]}`}>{pillText(r)}</span>
            </div>
            <label htmlFor={id} className="mt-3 block text-sm font-medium text-slate-800 dark:text-slate-200">{r.label} email address</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                id={id}
                name={id}
                type="email"
                inputMode="email"
                autoComplete="off"
                disabled={locked}
                value={values[r.dept] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [r.dept]: e.target.value }))}
                placeholder={r.suggested}
                className={`${field} min-w-[16rem] flex-1`}
              />
              {!locked && !values[r.dept] && (
                <button type="button" className={ghostBtn} data-testid={`email-use-${r.dept}`} onClick={() => setValues((v) => ({ ...v, [r.dept]: r.suggested }))}>
                  Use {r.suggested}
                </button>
              )}
              {r.mailboxId && mailOn && (
                <Link href={`/dashboard/${r.dept}/mail/settings?box=${r.mailboxId}`} className={primaryBtn} data-testid={`email-connect-${r.dept}`}>
                  {locked ? "Manage" : r.status === "NEEDS_RECONNECT" ? "Reconnect" : "Connect"}
                </Link>
              )}
            </div>
            {locked && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Connected as {r.accountEmail}. Change it from Manage.</p>}
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button className={primaryBtn} disabled={pending} data-testid="emails-save">{pending ? "Saving…" : "Save addresses"}</button>
        {state.notice && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status" data-testid="emails-msg">{state.notice}</p>}
        {state.error && <p className="text-sm text-red-700 dark:text-red-400" role="alert" data-testid="emails-error">{state.error}</p>}
      </div>
      {state.warnings && state.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300" data-testid="emails-warnings">
          {state.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </form>
  );
}
