"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectEmail, sendTestEmail } from "@/app/actions/customer-service";

export type ConnectionView = {
  provider: "GOOGLE" | "MICROSOFT" | "SMTP";
  email: string;
  status: "ACTIVE" | "NEEDS_RECONNECT";
  connectedAt: string;
  lastUsedAt: string | null;
  connectedByName: string | null;
  lastError: string | null;
};
export type ProviderOption = { key: "GOOGLE" | "MICROSOFT"; label: string; sub: string; configured: boolean; href: string };

const PROVIDER_LABEL = { GOOGLE: "Google (Gmail / Google Workspace)", MICROSOFT: "Microsoft (Outlook / Microsoft 365)", SMTP: "Other mailbox" } as const;

const ERRORS: Record<string, string> = {
  denied: "The sign-in was cancelled, so nothing was connected.",
  state: "That sign-in expired or came from a different session. Please try again.",
  missing_permission: "The permission to send email wasn't approved. Try again and leave the \"send email\" box ticked.",
  no_refresh: "The provider didn't give us lasting permission. Try again, and choose the account once more when asked.",
  no_email: "We couldn't read the email address from that account. Try again.",
  exchange: "The provider didn't accept the sign-in. Please try again in a minute.",
  not_configured: "Connecting this kind of mailbox isn't switched on for this platform yet.",
};

function when(stamp: string | null) {
  const m = stamp ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(stamp) : null;
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const btn = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800";

/** "Send emails from": connect the mailbox customers should see as the sender (the old payables address), or disconnect it. */
export function EmailConnectorCard({ connection, providers, flash, children }: { connection: ConnectionView | null; providers: ProviderOption[]; flash: { connected?: boolean; error?: string }; children?: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(flash.error ? ERRORS[flash.error] ?? "That didn't work. Please try again." : "");
  const [message, setMessage] = useState(flash.connected ? "Connected. Customer emails will now be sent from this address." : "");
  const [confirming, setConfirming] = useState(false);
  const [showOther, setShowOther] = useState(false);

  function run(fn: () => Promise<{ ok?: boolean; error?: string; notice?: string }>, done: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const r = await fn();
      setConfirming(false);
      if (r.error) setError(r.error);
      else {
        setMessage(r.notice ?? done);
        router.refresh();
      }
    });
  }

  const broken = connection?.status === "NEEDS_RECONNECT";
  return (
    <section aria-label="Send emails from" className="mb-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="connector">
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Send emails from your own address</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Moving from another system? Connect the mailbox you already use for payments (for example payables@yourcompany.com). Customers then see that address as the sender, and replies come back to it.
      </p>

      {connection ? (
        <div className={`mt-4 rounded-lg border p-4 text-sm ${broken ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30"}`} data-testid="connection">
          <p className="font-semibold text-slate-900 dark:text-slate-50">
            {broken ? "Needs to be reconnected: " : "Connected: "}
            <span data-testid="connected-email">{connection.email}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {PROVIDER_LABEL[connection.provider]} · connected {when(connection.connectedAt)}{connection.connectedByName ? ` by ${connection.connectedByName}` : ""}
            {connection.lastUsedAt ? ` · last email sent ${when(connection.lastUsedAt)}` : " · no email sent yet"}
          </p>
          {broken && <p className="mt-2 text-red-800 dark:text-red-200">Customer emails can&apos;t be sent until this is reconnected. Pick the provider below and sign in again.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!broken && <button type="button" disabled={pending} onClick={() => run(() => sendTestEmail(), "Test email sent.")} className={btn} data-testid="send-test">Send me a test email</button>}
            {confirming ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>Disconnect {connection.email}? Customer emails will go from the platform&apos;s address instead.</span>
                <button type="button" disabled={pending} onClick={() => run(() => disconnectEmail(), "Disconnected.")} className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900" data-testid="disconnect-confirm">Yes, disconnect</button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Cancel</button>
              </span>
            ) : (
              <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={btn} data-testid="disconnect">Disconnect</button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid="not-connected">
          No mailbox is connected, so customer emails are sent from the platform&apos;s own address. Connect yours to send from your company&apos;s address.
        </p>
      )}

      {(!connection || broken) && (
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{broken ? "Reconnect with" : "Connect with"}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {providers.map((p) =>
              p.configured ? (
                <a key={p.key} href={p.href} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2.5 text-sm font-semibold text-amber-950 hover:brightness-95" data-testid={`connect-${p.key}`}>
                  {p.label}
                  <span className="block text-xs font-normal opacity-80">{p.sub}</span>
                </a>
              ) : (
                <span key={p.key} className="rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-700" data-testid={`unavailable-${p.key}`}>
                  {p.label}
                  <span className="block text-xs">Not switched on for this platform yet</span>
                </span>
              ),
            )}
            <button type="button" aria-expanded={showOther} onClick={() => setShowOther(!showOther)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800" data-testid="connect-SMTP">
              Any other email
              <span className="block text-xs font-normal text-slate-500">Type the address and password</span>
            </button>
          </div>
          {showOther && children}
          <p className="mt-2 text-xs text-slate-500">With Google or Microsoft you&apos;ll sign in on the provider&apos;s own page and approve one permission: sending email for you. We never see your password, and you can disconnect any time. (For &ldquo;any other email&rdquo;, the password is stored encrypted.)</p>
        </div>
      )}

      {error && <p role="alert" data-testid="connector-error" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {message && <p role="status" data-testid="connector-message" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{message}</p>}
    </section>
  );
}
