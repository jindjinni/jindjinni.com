"use client";

import { useEffect, useState, useTransition } from "react";
import { eraseBankAction, revealBankAction, type BankView } from "@/app/actions/storefront";

const SHOW_SECONDS = 60;

/**
 * The direct-deposit details a seller sent. Everyone who can open the request sees only "Checking account ending 1234". People allowed to
 * see bank details can press Show: the numbers come from the server, stay in this box only, and hide themselves after a minute.
 */
export function BankBox({ requestId, line, canReveal, erased }: { requestId: string; line: string; canReveal: boolean; erased: boolean }) {
  const [view, setView] = useState<BankView>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [gone, setGone] = useState(erased);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!view?.details) return;
    const t = setTimeout(() => setView(undefined), SHOW_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [view]);

  const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950" data-testid="wr-bank">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Direct deposit details</h3>
      <p className="mt-1 text-slate-800 dark:text-slate-100" data-testid="wr-bank-line">{gone ? `${line} (the full details were erased)` : line}</p>
      {!gone && !canReveal && <p className="mt-1 text-xs text-slate-500" data-testid="wr-bank-locked">Only owners, admins and Accounts can see the full details.</p>}
      {!gone && canReveal && !view?.details && (
        <button type="button" disabled={pending} className={`${btn} mt-2`} data-testid="wr-bank-show" onClick={() => start(async () => { setMsg(null); const r = await revealBankAction(requestId); if (r?.error) setMsg(r.error); else setView(r); })}>{pending ? "Opening..." : "Show the full details"}</button>
      )}
      {view?.details && (
        <div className="mt-2 rounded-md bg-white p-3 text-sm dark:bg-slate-900" data-testid="wr-bank-details" role="region" aria-label="Bank details">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-400">Account holder (business owner)</dt><dd className="font-medium text-slate-900 dark:text-slate-50" data-testid="wr-bank-owner">{view.details.ownerName}</dd></div>
            <div><dt className="text-xs text-slate-400">Account type</dt><dd className="font-medium capitalize text-slate-900 dark:text-slate-50">{view.details.accountType}</dd></div>
            <div><dt className="text-xs text-slate-400">Routing number</dt><dd className="font-mono font-medium text-slate-900 dark:text-slate-50" data-testid="wr-bank-routing">{view.details.routingNumber}</dd></div>
            <div><dt className="text-xs text-slate-400">Account number</dt><dd className="font-mono font-medium text-slate-900 dark:text-slate-50" data-testid="wr-bank-account">{view.details.accountNumber}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">Hides itself after {SHOW_SECONDS} seconds. Looking at these details is recorded.</p>
          <button type="button" className={`${btn} mt-2`} data-testid="wr-bank-hide" onClick={() => setView(undefined)}>Hide</button>
        </div>
      )}
      {!gone && canReveal && (
        <div className="mt-2">
          {!confirming ? (
            <button type="button" className="text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" data-testid="wr-bank-erase" onClick={() => setConfirming(true)}>Erase the stored details (after the seller is paid)</button>
          ) : (
            <span className="text-xs text-slate-700 dark:text-slate-200">Erase the full details for good? Only the last 4 digits stay.{" "}
              <button type="button" disabled={pending} className="font-semibold text-red-700 underline" data-testid="wr-bank-erase-confirm" onClick={() => start(async () => { const r = await eraseBankAction(requestId); if (r.error) setMsg(r.error); else { setGone(true); setView(undefined); } setConfirming(false); })}>Yes, erase</button>{" "}
              <button type="button" className="underline" onClick={() => setConfirming(false)}>Cancel</button></span>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert" data-testid="wr-bank-error">{msg}</p>}
    </div>
  );
}
