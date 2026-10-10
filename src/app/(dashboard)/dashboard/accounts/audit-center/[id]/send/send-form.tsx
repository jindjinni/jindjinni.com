"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { checkSendAction, sendAuditAction } from "@/app/actions/audit";
import type { CheckResult } from "@/lib/audit-send";
import type { AuditType } from "@/lib/audit-rules";
import { card, field, primaryBtn } from "@/components/sales-ui";

const label = "text-xs font-medium text-slate-700 dark:text-slate-300";

type Props = {
  auditId: string;
  type: AuditType;
  versionId: string;
  version: { version: number; fileName: string; fileBytes: number; rowCount: number; invoiceCount: number };
  defaults: { to: string; cc: string; subject: string; body: string };
  attachments: { id: string; kind: string; fileName: string; fileBytes: number }[];
  invoices: { number: string; date: string | null; available: boolean }[];
  mailbox: { state: "NONE" | "ACTIVE" | "NEEDS_RECONNECT"; email: string | null };
  isManager: boolean;
  back: string;
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function SendAuditForm(p: Props) {
  const [state, action, sending] = useActionState(sendAuditAction.bind(null, p.auditId), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, startCheck] = useTransition();
  const [mode, setMode] = useState<"NONE" | "ALL" | "SELECTED">("NONE");
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pbm = p.type === "PBM";

  const run = useCallback(() => {
    const f = formRef.current;
    if (!f) return;
    const fd = new FormData(f);
    startCheck(async () => {
      setResult(await checkSendAction(p.auditId, fd));
    });
  }, [p.auditId]);

  // Check once when the screen opens, and again (shortly after typing stops) whenever anything changes.
  useEffect(() => {
    run();
  }, [run]);
  const changed = (e: React.ChangeEvent<HTMLFormElement>) => {
    if ((e.target as unknown as HTMLInputElement).name === "confirm") return; // ticking the review box is not a change to the email
    setConfirm(false); // any edit means the person has to review again
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, 350);
  };

  const good = result?.ok === true && result.canSend;
  const done = state?.message !== undefined && !state?.error;

  return (
    <form ref={formRef} action={action} onChange={changed} className="space-y-4" data-testid="send-form">
      <input type="hidden" name="versionId" value={p.versionId} />

      {p.mailbox.state !== "ACTIVE" && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100" role="alert" data-testid="no-mailbox">
          {p.mailbox.state === "NONE" ? "No company email is connected yet (connect one in Settings → Connectors, or the Accounts Mail tab)." : "The connected company email needs to be reconnected."}{" "}
          <Link href="/dashboard/settings/connectors" className="underline">Connect it in Settings → Connectors</Link>. Audit files only go out from your own mailbox, never from ours.
        </p>
      )}

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Recipients and message</h2>
        {p.mailbox.email && <p className="text-xs text-slate-600 dark:text-slate-400">From: <strong data-testid="from-address">{p.mailbox.email}</strong></p>}
        <div>
          <label htmlFor="to" className={label}>To (one address)</label>
          <input id="to" name="to" defaultValue={p.defaults.to} className={`${field} mt-1`} data-testid="send-to" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="cc" className={label}>CC (separate several with commas)</label>
          <input id="cc" name="cc" defaultValue={p.defaults.cc} className={`${field} mt-1`} data-testid="send-cc" autoComplete="off" />
          {p.type === "REGULATORY" && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">The pharmacy is not copied on regulatory emails. {p.isManager ? "As an Admin or Owner you may add a CC when it is appropriate." : "Only an Admin or the Owner can add a CC."}</p>}
          {pbm && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">PBM audits go to the auditor with the pharmacy copied.</p>}
        </div>
        <div>
          <label htmlFor="subject" className={label}>Subject</label>
          <input id="subject" name="subject" defaultValue={p.defaults.subject} className={`${field} mt-1`} data-testid="send-subject" />
        </div>
        <div>
          <label htmlFor="body" className={label}>Message</label>
          <textarea id="body" name="body" rows={9} defaultValue={p.defaults.body} className={`${field} mt-1`} data-testid="send-body" />
        </div>
      </section>

      <section className={`${card} space-y-2`} data-testid="attachment-check">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Attachments</h2>
        <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked readOnly disabled data-testid="att-excel" /> Excel audit file — version {p.version.version}: {p.version.fileName} <span className="text-slate-500">({kb(p.version.fileBytes)}, {p.version.rowCount} rows)</span>
        </label>
        {p.attachments.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No original request or other documents are saved on this case.</p>}
        {p.attachments.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
            <input type="checkbox" name="attachmentId" value={a.id} defaultChecked={pbm && a.kind === "REQUEST"} data-testid="att-doc" /> {a.kind === "REQUEST" ? "Original audit request" : "Document"}: {a.fileName} <span className="text-slate-500">({kb(a.fileBytes)})</span>
          </label>
        ))}
        <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
          <p className={label}>Invoice copies{pbm ? " (not allowed for a PBM: invoices show prices)" : ""}</p>
          {(["NONE", "ALL", "SELECTED"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input type="radio" name="invoiceMode" value={m} checked={mode === m} disabled={pbm && m !== "NONE"} onChange={() => setMode(m)} data-testid={`inv-${m}`} />
              {m === "NONE" ? "None" : m === "ALL" ? `All relevant invoices (${p.invoices.length})` : "Selected invoices"}
            </label>
          ))}
          {mode === "SELECTED" && (
            <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700" data-testid="invoice-picks">
              {p.invoices.map((i) => (
                <label key={i.number} className="flex items-center gap-2 py-0.5 text-sm text-slate-800 dark:text-slate-100">
                  <input type="checkbox" name="invoiceNumber" value={i.number} disabled={!i.available} /> {i.number}{i.date ? ` · ${i.date}` : ""}
                  {!i.available && <span className="font-semibold text-red-700 dark:text-red-300"> INVOICE COPY NOT AVAILABLE</span>}
                </label>
              ))}
            </div>
          )}
          {mode === "ALL" && p.invoices.some((i) => !i.available) && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">INVOICE COPY NOT AVAILABLE for {p.invoices.filter((i) => !i.available).map((i) => i.number).join(", ")}</p>}
          {mode !== "NONE" && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">The invoices are joined into one PDF named after the case, and a copy is saved on the case exactly as sent.</p>}
        </div>
      </section>

      <section className={`${card} space-y-2`} data-testid="validation">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{pbm ? "PBM audit validation" : p.type === "REGULATORY" ? "Regulatory audit validation" : "Internal audit validation"}</h2>
        {!result || checking ? <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="checking">Checking…</p> : null}
        {result?.ok === false && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{result.error}</p>}
        {result?.ok === true && (
          <>
            <ul className="space-y-1 text-sm" data-testid="check-list">
              {result.checks.map((c) => (
                <li key={c.label} data-ok={c.ok ? "yes" : "no"} className={c.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"}>
                  {c.ok ? "✓" : "✗"} {c.label}{!c.ok && c.note ? <span className="text-slate-700 dark:text-slate-300"> — {c.note}</span> : null}
                </li>
              ))}
            </ul>
            {result.warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" data-testid="send-warnings">
                {result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
              </ul>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-400">Attachments together: {kb(result.sizeBytes)}</p>
          </>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" name="confirm" value="yes" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5" data-testid="send-confirm" />
          <span>I reviewed the recipient, CC, subject, message and every attachment.</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className={primaryBtn} disabled={!good || !confirm || checking || sending || done} data-testid="send-audit">{sending ? "Sending…" : "SEND AUDIT"}</button>
          <Link href={p.back} className="text-sm text-emerald-800 underline dark:text-emerald-300">{done ? "Back to the case" : "Cancel"}</Link>
        </div>
        {state?.error && <p className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="send-error">{state.error}</p>}
        {done && <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300" role="status" data-testid="send-done">{state?.message}</p>}
      </section>
    </form>
  );
}
