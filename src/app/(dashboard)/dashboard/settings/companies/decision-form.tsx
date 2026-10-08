"use client";

import { useActionState, useState } from "react";
import { decideApprovalAction } from "@/app/actions/approvals";

const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60";
const redOutline = `${btn} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`;
const redSolid = `${btn} bg-red-600 text-white hover:bg-red-700`;

type Status = "pending" | "approved" | "rejected" | "suspended" | "banned";
type Asking = null | "reject" | "suspend" | "ban";

const ASK: Record<Exclude<Asking, null>, { label: string; confirm: string; help: string }> = {
  reject: { label: "Turn down…", confirm: "Confirm turn down", help: "What should they fix? They will read this." },
  suspend: { label: "Suspend…", confirm: "Confirm suspend", help: "Which part of our Terms and Conditions did they break? They will read this." },
  ban: { label: "Ban…", confirm: "Confirm ban", help: "Which part of our Terms and Conditions did they break? Only you will see this." },
};

/** The buttons that fit this company's current state. Every one is re-checked on the server. */
export function DecisionForm({ orgId, status }: { orgId: string; status: Status }) {
  const [state, act, busy] = useActionState(decideApprovalAction, undefined);
  const [asking, setAsking] = useState<Asking>(null);
  // Controlled on purpose: React clears plain form fields after every submit, which would wipe what was typed when the server says "add a reason".
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const canReject = status === "pending";
  const canSuspend = status === "approved";
  const canBan = status !== "banned";

  const openers: { key: Exclude<Asking, null>; show: boolean; cls: string }[] = [
    { key: "reject", show: canReject, cls: redOutline },
    { key: "suspend", show: canSuspend, cls: redOutline },
    { key: "ban", show: canBan, cls: redOutline },
  ];

  return (
    <form action={act} className="flex flex-col gap-2" data-testid={`decision-${orgId}`}>
      <input type="hidden" name="orgId" value={orgId} />
      {asking && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`reason-${orgId}`} className="text-xs font-medium text-slate-600 dark:text-slate-300">{ASK[asking].help}</label>
            <textarea id={`reason-${orgId}`} name="reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
          {asking === "ban" && (
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" name="confirm" value="yes" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1" data-testid="ban-confirm-box" />
              <span>I understand a ban is permanent. Their account closes and their EIN can never be used to sign up again.</span>
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!asking && (status === "pending" || status === "rejected") && (
          <button name="decision" value="approve" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={busy} data-testid="approve">Approve</button>
        )}
        {!asking && status === "suspended" && (
          <button name="decision" value="reinstate" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={busy} data-testid="reinstate">Reinstate</button>
        )}
        {!asking && status === "banned" && (
          <button name="decision" value="unban" className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`} disabled={busy} data-testid="unban">Lift ban</button>
        )}
        {!asking &&
          openers.filter((o) => o.show).map((o) => (
            <button key={o.key} type="button" onClick={() => setAsking(o.key)} className={o.cls} data-testid={`${o.key}-open`}>{ASK[o.key].label}</button>
          ))}
        {asking && (
          <>
            <button name="decision" value={asking} className={redSolid} disabled={busy} data-testid={`${asking}-confirm`}>{ASK[asking].confirm}</button>
            <button type="button" onClick={() => { setAsking(null); setReason(""); setSure(false); }} className={`${btn} text-slate-600 dark:text-slate-300`}>Cancel</button>
          </>
        )}
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}
    </form>
  );
}
