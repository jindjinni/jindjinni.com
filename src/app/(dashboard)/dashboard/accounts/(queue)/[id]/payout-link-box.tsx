"use client";

import { useEffect, useState, useTransition } from "react";
import { erasePayoutLinkAction, revealPayoutLinkAction, type RevealPayoutView } from "@/app/actions/payout-links";
import { addressLine, methodLabel } from "@/lib/payout-link-rules";

const SHOW_SECONDS = 60;
const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

/**
 * Accounts: the payment details the customer typed on their private link. Everyone sees only "PayPal - Checking account ending 1234".
 * Owners, admins and Accounts can press Show: the details come from the server, stay in this box only, hide themselves after a minute,
 * and each look is recorded. They are erased automatically when the order is marked Paid.
 */
export function PayoutLinkBox({ quotationId, line, canReveal, erased }: { quotationId: string; line: string; canReveal: boolean; erased: boolean }) {
  const [view, setView] = useState<RevealPayoutView | undefined>(undefined);
  const [gone, setGone] = useState(erased);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!view?.details) return;
    const t = setTimeout(() => setView(undefined), SHOW_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [view]);
  const d = view?.details;
  const row = (label: string, value: string, mono = false, testid?: string) => (
    <div><dt className="text-xs text-slate-400">{label}</dt><dd className={`font-medium text-slate-900 dark:text-slate-50 ${mono ? "font-mono" : ""}`} data-testid={testid}>{value}</dd></div>
  );
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950" data-testid="plb">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer payment details (sent on their private link)</h3>
      <p className="mt-1 text-slate-800 dark:text-slate-100" data-testid="plb-line">{gone ? `${line} (the full details were erased)` : line}</p>
      {!gone && !canReveal && <p className="mt-1 text-xs text-slate-500" data-testid="plb-locked">Only owners, admins and Accounts can see the full details.</p>}
      {!gone && canReveal && !d && (
        <button type="button" disabled={pending} className={`${btn} mt-2`} data-testid="plb-show" onClick={() => start(async () => { setMsg(null); const r = await revealPayoutLinkAction(quotationId); if (r.error) setMsg(r.error); else setView(r); })}>{pending ? "Opening..." : "Show the full details"}</button>
      )}
      {d && (
        <div className="mt-2 rounded-md bg-white p-3 text-sm dark:bg-slate-900" data-testid="plb-details" role="region" aria-label="Payment details">
          <dl className="grid gap-2 sm:grid-cols-2">
            {row("Pay through", methodLabel(d.method), false, "plb-method")}
            {row("Account holder", d.holderName, false, "plb-holder")}
            {row("Address", addressLine(d))}
            {row("Phone", d.phone)}
            {row("Email", d.email)}
            {row("Bank name", d.bankName, false, "plb-bank")}
            {row("Routing number", d.routingNumber, true, "plb-routing")}
            {row("Account number", d.accountNumber, true, "plb-account")}
            {row("Account type", d.accountType === "savings" ? "Savings" : "Checking")}
          </dl>
          <p className="mt-2 text-xs text-slate-500">Hides itself after {SHOW_SECONDS} seconds. Looking at these details is recorded. They are erased when you mark the order Paid.</p>
          <button type="button" className={`${btn} mt-2`} data-testid="plb-hide" onClick={() => setView(undefined)}>Hide</button>
        </div>
      )}
      {!gone && canReveal && (
        <div className="mt-2">
          {!confirming ? (
            <button type="button" className="text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" data-testid="plb-erase" onClick={() => setConfirming(true)}>Erase the stored details now</button>
          ) : (
            <span className="text-xs text-slate-700 dark:text-slate-200">Erase the full details for good? Only the last 4 digits stay.{" "}
              <button type="button" disabled={pending} className="font-semibold text-red-700 underline" data-testid="plb-erase-confirm" onClick={() => start(async () => { const r = await erasePayoutLinkAction(quotationId); if (r.error) setMsg(r.error); else { setGone(true); setView(undefined); } setConfirming(false); })}>Yes, erase</button>{" "}
              <button type="button" className="underline" onClick={() => setConfirming(false)}>Cancel</button></span>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert" data-testid="plb-error">{msg}</p>}
    </div>
  );
}
