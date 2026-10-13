"use client";

import { useState, useTransition } from "react";
import {
  cancelPayoutLinkAction, copyPayoutLinkAction, makePayoutLinkAction, previewPayoutLinkEmailAction, sendPayoutLinkEmailAction,
} from "@/app/actions/payout-links";
import { LINK_REASONS, methodLabel, reasonLabel, STAFF_STATE_TEXT, type LinkReason, type StaffLinkState } from "@/lib/payout-link-rules";

export type PayoutCardSummary = { state: StaffLinkState; reason: string | null; reasonNote: string | null; method: string | null; accountLast4: string | null; accountType: string | null; submittedAt: string | null; emailedTo: string | null; emailedAt: string | null; expiresAt: string } | null;

const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const btnMain = "rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60";

/**
 * Purchasing: the private "where should we pay you?" link for this order. Staff make it, copy it or email it (a reviewed message, sent only
 * when a person presses Send). They see only "PayPal - Checking account ending 1234"; the full details are for Accounts.
 */
export function PayoutLinkCard({ quotationId, summary, customerEmail, paidBefore }: { quotationId: string; summary: PayoutCardSummary; customerEmail: string; paidBefore: { paidOrders: number; lastPaidDay: string | null; otherOrders: number } }) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mail, setMail] = useState<{ to: string; subject: string; text: string } | null>(null);
  const state = summary?.state ?? "none";
  // The reason defaults to what the records suggest: never paid before -> "haven't paid", otherwise nothing is pre-picked for a customer we have paid.
  const suggested: LinkReason | "" = paidBefore.otherOrders === 0 ? "new_customer" : paidBefore.paidOrders === 0 ? "never_paid" : "";
  const [reason, setReason] = useState<LinkReason | "">(suggested);
  const [note, setNote] = useState("");
  const run = (fn: () => Promise<void>) => start(async () => { setErr(null); setMsg(null); await fn(); });

  const make = (replace: boolean) => run(async () => {
    const r = await makePayoutLinkAction(quotationId, reason, note, replace);
    if (r.error) setErr(r.error); else { setUrl(r.url ?? null); setMsg("New link made. Copy it or email it to the customer."); }
  });
  const copy = () => run(async () => {
    const r = url ? { url } : await copyPayoutLinkAction(quotationId);
    if (r.error || !r.url) { setErr(r.error ?? "Could not get the link."); return; }
    setUrl(r.url);
    try { await navigator.clipboard.writeText(r.url); setMsg("Link copied."); } catch { setMsg("Select the link below and copy it."); }
  });
  const openMail = () => run(async () => {
    const r = await previewPayoutLinkEmailAction(quotationId);
    if (r.error) setErr(r.error); else setMail({ to: r.to ?? customerEmail, subject: r.subject ?? "", text: r.text ?? "" });
  });
  const send = () => run(async () => {
    if (!mail) return;
    const r = await sendPayoutLinkEmailAction(quotationId, mail.to);
    if (r.error) setErr(r.error); else { setMsg(r.message ?? "Sent."); setMail(null); }
  });

  const needsLink = state === "none" || state === "expired" || state === "cancelled" || state === "erased";
  return (
    <section className="mt-6 rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-5 dark:border-emerald-700 dark:bg-emerald-950/30" data-testid="pl-card" aria-label="Request the customer's payment details">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Request the customer&apos;s banking details</h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
        Generate one private, encrypted link for <strong>this order</strong>, then copy it or email it to the customer. The link works <strong>one time only</strong>. They type their direct-deposit details there (PayPal, Cash App or Venmo) and the details come into our system safely. Only Accounts, admins and the owner can see them.
      </p>
      <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${paidBefore.paidOrders === 0 ? "bg-amber-100 text-amber-950 dark:bg-amber-900/30 dark:text-amber-100" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"}`} data-testid="pl-hint">
        {paidBefore.otherOrders === 0
          ? "This is the first order we have for this customer. Send the link so they can tell us where to pay them."
          : paidBefore.paidOrders === 0
            ? "We have other orders for this customer but have not paid them yet. Send the link so they can tell us where to pay them."
            : `We have paid this customer before (last on ${paidBefore.lastPaidDay ?? "an earlier date"}). Only send the link if their banking details changed.`}
      </p>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" data-testid="pl-state">{STAFF_STATE_TEXT[state]}</p>
      {summary?.reason && state !== "none" && <p className="mt-1 text-xs text-slate-500" data-testid="pl-reason">Reason: {reasonLabel(summary.reason)}{summary.reasonNote ? ` - ${summary.reasonNote}` : ""}</p>}
      {state === "received" && summary && (
        <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100" data-testid="pl-line">
          {methodLabel(summary.method)} - {summary.accountType === "savings" ? "Savings" : "Checking"} account ending {summary.accountLast4}
          <span className="ml-2 text-xs font-normal text-slate-500">sent {summary.submittedAt?.slice(0, 10)}. Accounts can see the full details when it is time to pay. The link is used up; if something is wrong, press Ask for new details.</span>
        </p>
      )}
      {state === "waiting" && summary && (
        <p className="mt-1 text-xs text-slate-500">Works until {summary.expiresAt.slice(0, 10)}.{summary.emailedTo ? ` Emailed to ${summary.emailedTo} on ${summary.emailedAt?.slice(0, 10)}.` : ""}</p>
      )}
      {needsLink && (
        <fieldset className="mt-4" data-testid="pl-reasons">
          <legend className="text-sm font-medium text-slate-800 dark:text-slate-100">Why are you sending this link?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LINK_REASONS.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:has-[:checked]:bg-emerald-900/30">
                <input type="radio" name={`pl-reason-${quotationId}`} className="mt-0.5" checked={reason === r.key} onChange={() => setReason(r.key)} data-testid={`pl-reason-${r.key}`} />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
          {reason === "other" && (
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Short reason" aria-label="Short reason" className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" data-testid="pl-reason-note" />
          )}
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {needsLink && (
          <button type="button" className="rounded-xl bg-emerald-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60" disabled={pending || !reason} onClick={() => make(state === "erased")} data-testid="pl-make">
            {pending ? "Working..." : state === "erased" ? "Generate a new payment-details link" : "Generate payment-details link"}
          </button>
        )}
        {state === "waiting" && (
          <>
            <button type="button" className={btnMain} disabled={pending} onClick={openMail} data-testid="pl-email">Email this link</button>
            <button type="button" className={btn} disabled={pending} onClick={copy} data-testid="pl-copy">Copy link</button>
            <button type="button" className={btn} disabled={pending} onClick={() => run(async () => { const r = await cancelPayoutLinkAction(quotationId); if (r.error) setErr(r.error); else setMsg(r.message ?? "Cancelled."); })} data-testid="pl-cancel">Cancel the link</button>
          </>
        )}
        {state === "received" && (
          <button type="button" className={btn} disabled={pending || !reason} onClick={() => { if (window.confirm("The details they sent will be erased and they will get a new link. Continue?")) make(true); }} data-testid="pl-ask-again">Ask for new details</button>
        )}
      </div>
      {state === "waiting" && (
        <p className="mt-2 text-xs text-slate-500">Need a different link? Cancel this one, then make a new one. A new link always stops the old one.</p>
      )}
      {state === "received" && (
        <fieldset className="mt-3">
          <legend className="text-xs text-slate-500">To ask again, say why:</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {LINK_REASONS.filter((r) => r.key !== "other").map((r) => (
              <label key={r.key} className="flex items-center gap-1 text-xs"><input type="radio" name={`pl-again-${quotationId}`} checked={reason === r.key} onChange={() => setReason(r.key)} data-testid={`pl-again-${r.key}`} />{r.label}</label>
            ))}
          </div>
        </fieldset>
      )}
      {url && (
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-3 w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950" aria-label="Payment-details link" data-testid="pl-url" />
      )}
      {mail && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700" data-testid="pl-mail">
          <label className="block text-xs font-medium text-slate-500" htmlFor="pl-to">Send to</label>
          <input id="pl-to" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} type="email" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950" data-testid="pl-to" />
          <p className="mt-3 text-xs font-medium text-slate-500">Subject</p>
          <p className="text-slate-800 dark:text-slate-100">{mail.subject}</p>
          <p className="mt-3 text-xs font-medium text-slate-500">Message (read it, then press Send)</p>
          <pre className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{mail.text}</pre>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnMain} disabled={pending} onClick={send} data-testid="pl-send">{pending ? "Sending..." : "Send"}</button>
            <button type="button" className={btn} onClick={() => setMail(null)}>Close</button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300" role="status" data-testid="pl-msg">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert" data-testid="pl-err">{err}</p>}
    </section>
  );
}
