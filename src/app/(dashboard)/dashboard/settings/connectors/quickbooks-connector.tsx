"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectQuickBooksAction } from "@/app/actions/quickbooks";
import { ACK_LABEL, NOTICE_HEADING, NOTICE_POINTS, TERMS_VERSION } from "@/lib/quickbooks-rules";

const card = "rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const primaryBtn = "inline-block rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700";
const dangerBtn = "text-sm font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400";

const ERRORS: Record<string, string> = {
  ack: "Please read the notice and tick the box before connecting.",
  not_configured: "The platform hasn't set up the QuickBooks link yet, so it can't be connected. Please contact support.",
  denied: "QuickBooks wasn't connected (the sign-in was cancelled or not approved). Nothing was changed.",
  state: "That sign-in took too long or came from a different session. Please press Connect QuickBooks again.",
  exchange: "QuickBooks didn't accept the sign-in. Please try again in a minute.",
};

export type QbCardProps = {
  connected: boolean;
  status: "ACTIVE" | "NEEDS_RECONNECT" | "NONE";
  companyName: string | null;
  connectedByName: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  configured: boolean;
  justConnected: boolean;
  error: string | null;
};

/** The company's QuickBooks Online connection: the notice, the Connect button (only after the box is ticked), and Disconnect. */
export function QuickBooksConnector(p: QbCardProps) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const active = p.connected && p.status === "ACTIVE";
  const showConnect = !active;

  return (
    <section id="quickbooks" className={card} data-testid="quickbooks-connector">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">QuickBooks</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Connect your own QuickBooks Online so Sales and Accounts can see who has paid, who owes and your profit and loss. Read only. QuickBooks Desktop or Enterprise: no connection is needed; upload an exported report in Accounts or Sales, QuickBooks.
      </p>

      {p.justConnected && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" data-testid="qb-flash-ok">QuickBooks is connected. Open Accounts or Sales, then QuickBooks, to pull your reports.</p>}
      {p.error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400" data-testid="qb-flash-error">{ERRORS[p.error] ?? ERRORS.exchange}</p>}

      <div className="mt-3 text-sm" data-testid="qb-state">
        {active && (
          <p className="text-slate-700 dark:text-slate-300">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Connected</span>
            {p.companyName ? <> · {p.companyName}</> : null}
            {p.connectedByName ? <> · connected by {p.connectedByName}</> : null}
            {p.lastUsedAt ? <> · last used {p.lastUsedAt.slice(0, 16).replace("T", " ")} UTC</> : null}
          </p>
        )}
        {p.connected && p.status === "NEEDS_RECONNECT" && (
          <div className="text-red-700 dark:text-red-400">
            <p className="font-medium">Needs attention. QuickBooks reports can&apos;t be pulled until you reconnect.</p>
            {p.lastError && <p className="mt-0.5">{p.lastError}</p>}
          </div>
        )}
        {!p.connected && <p className="text-amber-800 dark:text-amber-300">Not connected.</p>}
      </div>

      {showConnect && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30" data-testid="qb-notice">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{NOTICE_HEADING}</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {NOTICE_POINTS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-sm font-medium text-slate-900 dark:text-slate-50">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="qb-ack" />
            {ACK_LABEL}
          </label>
          <div className="mt-3">
            {!p.configured ? (
              <p className="text-sm text-amber-800 dark:text-amber-300" data-testid="qb-not-configured">The platform hasn&apos;t set up the QuickBooks link yet, so it can&apos;t be connected. Please contact support.</p>
            ) : ack ? (
              <a className={primaryBtn} href={`/api/quickbooks/start?ack=${encodeURIComponent(TERMS_VERSION)}`} data-testid="qb-connect">
                {p.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
              </a>
            ) : (
              <button type="button" disabled className={`${primaryBtn} opacity-50`} data-testid="qb-connect-disabled">
                {p.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
              </button>
            )}
          </div>
        </div>
      )}

      {p.connected && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {!confirmOff ? (
            <button type="button" className={dangerBtn} onClick={() => setConfirmOff(true)} data-testid="qb-disconnect">Disconnect</button>
          ) : (
            <>
              <span className="text-sm text-slate-700 dark:text-slate-300">Disconnect QuickBooks? Saved report copies stay; nothing in QuickBooks changes.</span>
              <button
                type="button"
                className={dangerBtn}
                disabled={pending}
                data-testid="qb-disconnect-yes"
                onClick={() =>
                  start(async () => {
                    const r = await disconnectQuickBooksAction();
                    setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
                    setConfirmOff(false);
                    router.refresh();
                  })
                }
              >
                Yes, disconnect
              </button>
              <button type="button" className="text-sm text-slate-600 hover:underline dark:text-slate-400" onClick={() => setConfirmOff(false)}>Keep it</button>
            </>
          )}
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid={msg.ok ? "qb-msg-ok" : "qb-msg-error"}>{msg.text}</p>}
    </section>
  );
}
