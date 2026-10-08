"use client";

import { useActionState, useState } from "react";
import { decideApprovalAction } from "@/app/actions/approvals";

const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60";

/** Approve / Reject buttons for one company. Rejecting needs a short note the company will read. */
export function DecisionForm({ orgId, status }: { orgId: string; status: "pending" | "approved" | "rejected" }) {
  const [state, act, busy] = useActionState(decideApprovalAction, undefined);
  const [rejecting, setRejecting] = useState(false);
  const rejectLabel = status === "approved" ? "Suspend…" : "Reject…";
  return (
    <form action={act} className="flex flex-col gap-2" data-testid={`decision-${orgId}`}>
      <input type="hidden" name="orgId" value={orgId} />
      {rejecting && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`reason-${orgId}`} className="text-xs font-medium text-slate-600 dark:text-slate-300">What should they fix? They will read this.</label>
          <textarea id={`reason-${orgId}`} name="reason" rows={2} maxLength={500} className="rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {status !== "approved" && (
          <button name="decision" value="approve" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={busy} data-testid="approve">Approve</button>
        )}
        {!rejecting ? (
          status !== "rejected" && (
            <button type="button" onClick={() => setRejecting(true)} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`} data-testid="reject-open">{rejectLabel}</button>
          )
        ) : (
          <>
            <button name="decision" value="reject" className={`${btn} bg-red-600 text-white hover:bg-red-700`} disabled={busy} data-testid="reject-confirm">{status === "approved" ? "Confirm suspend" : "Confirm reject"}</button>
            <button type="button" onClick={() => setRejecting(false)} className={`${btn} text-slate-600 dark:text-slate-300`}>Cancel</button>
          </>
        )}
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p>}
    </form>
  );
}
