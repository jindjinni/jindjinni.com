"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  connectMailboxSmtpAction, detectMailboxAction, disconnectMailboxAction, hideMailboxAction, renameMailboxAction, testMailboxAction, type MailState,
} from "@/app/actions/mailbox";
import { field, ghostBtn, primaryBtn } from "@/components/sales-ui";
import type { Detected } from "@/lib/email-smtp";

export type CardBox = {
  id: string;
  name: string;
  kind: "SHARED" | "PERSONAL";
  ownerName: string | null;
  status: "NOT_CONNECTED" | "ACTIVE" | "NEEDS_RECONNECT";
  provider: "GOOGLE" | "MICROSOFT" | "SMTP" | null;
  accountEmail: string | null;
  canRead: boolean;
  lastError: string | null;
  hidden: boolean;
  rights: { read: boolean; send: boolean; manage: boolean; connect: boolean };
};
export type ProviderLink = { key: "GOOGLE" | "MICROSOFT"; label: string; sub: string; configured: boolean; href: string };

const PILL: Record<CardBox["status"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  NEEDS_RECONNECT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  NOT_CONNECTED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};
const PILL_TEXT: Record<CardBox["status"], string> = { ACTIVE: "Connected", NEEDS_RECONNECT: "Needs reconnecting", NOT_CONNECTED: "Not connected yet" };
const PROVIDER_TEXT = { GOOGLE: "Google (Gmail / Google Workspace)", MICROSOFT: "Microsoft (Outlook / Microsoft 365)", SMTP: "another email host" } as const;

function OtherMailboxForm({ dept, id }: { dept: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [detected, setDetected] = useState<Detected | null>(null);
  const [error, setError] = useState("");

  function detect() {
    setError("");
    if (!email.trim()) return;
    start(async () => {
      const r = await detectMailboxAction(dept, id, email);
      if (r.error) { setError(r.error); setDetected(null); return; }
      setDetected(r.detected ?? null);
      if (r.detected?.kind === "SMTP") { setHost(r.detected.host); setPort(String(r.detected.port || 587)); }
    });
  }
  function connect() {
    setError("");
    start(async () => {
      const r = await connectMailboxSmtpAction(dept, id, email, password, host, Number(port));
      if (r.error) setError(r.error);
      else { setPassword(""); router.refresh(); }
    });
  }
  const redirectTo = detected && detected.kind !== "SMTP";
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700" data-testid="mailbox-smtp-form">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-50">Another email host (GoDaddy, Yahoo, your own server…)</p>
      <div>
        <label htmlFor={`smtp-email-${id}`} className="mb-1 block text-sm">Email address</label>
        <input id={`smtp-email-${id}`} type="email" autoComplete="off" className={field} placeholder="purchasing@yourcompany.com" value={email} onChange={(e) => { setEmail(e.target.value); setDetected(null); }} onBlur={detect} />
      </div>
      {detected && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">
          {redirectTo ? <>This address is hosted by <strong>{detected.label}</strong>, so use the one-click sign-in above instead.</> : <>Looks like <strong>{detected.label}</strong>. We filled in the mail server; change it if your provider gave you different details.{detected.note ? ` ${detected.note}` : ""}</>}
        </p>
      )}
      {!redirectTo && (
        <>
          <div>
            <label htmlFor={`smtp-pass-${id}`} className="mb-1 block text-sm">Password (or app password)</label>
            <input id={`smtp-pass-${id}`} type="password" autoComplete="new-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Stored encrypted and used only to send from this mailbox. Mail from hosts like this can be sent from here; reading the Inbox here works with Google and Microsoft.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor={`smtp-host-${id}`} className="mb-1 block text-sm">Mail server</label>
              <input id={`smtp-host-${id}`} className={field} placeholder="smtp.yourhost.com" value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`smtp-port-${id}`} className="mb-1 block text-sm">Port</label>
              <select id={`smtp-port-${id}`} className={field} value={port} onChange={(e) => setPort(e.target.value)}>
                <option value="465">465 (SSL)</option>
                <option value="587">587 (TLS)</option>
                <option value="2525">2525</option>
              </select>
            </div>
          </div>
          <button type="button" className={primaryBtn} disabled={pending || !email || !password || !host} onClick={connect} data-testid="mailbox-smtp-connect">
            {pending ? "Checking…" : "Connect"}
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
}

function ShareText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor="share-text" className="block text-sm font-medium text-slate-800 dark:text-slate-200">Tell your team (copy and paste)</label>
      <textarea id="share-text" readOnly rows={4} value={text} className={`${field} text-slate-700`} />
      <button
        type="button"
        className={ghostBtn}
        onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the text can still be selected by hand */ }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** One mailbox on the settings page: its state, how to connect it (with the plain-language guide), a test, rename, hide and disconnect. */
export function MailboxCard({
  dept, deptLabel, orgName, box, providers, open, flash,
}: {
  dept: string;
  deptLabel: string;
  orgName: string;
  box: CardBox;
  providers: ProviderLink[];
  open: boolean;
  flash?: { connected?: boolean; noRead?: boolean; error?: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(box.name);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>(() => (flash?.error ? { error: flash.error } : flash?.connected ? { ok: flash.noRead ? "Connected for sending. Reading wasn't allowed, so the Inbox can't fill up. Reconnect and leave the “read email” box ticked to see incoming mail." : "Connected. Press Check connection to send yourself a test email." } : {}));

  function run(fn: () => Promise<MailState>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg({});
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ error: r.error });
      else { setMsg({ ok: r.notice ?? "Done." }); router.refresh(); }
    });
  }

  const connected = box.status !== "NOT_CONNECTED";
  const mine = box.kind === "PERSONAL";
  const share = `Hi team, we've set up the ${box.name} mailbox for ${deptLabel}. Open ${deptLabel} → Mail to read what comes in, send emails from ${box.accountEmail ?? "the company address"}, save drafts and schedule emails for later.`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid={`mailbox-card-${box.id}`} data-status={box.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{box.name}</h3>
          <span className="rounded bg-slate-100 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{mine ? `Personal${box.ownerName ? ` · ${box.ownerName}` : ""}` : "Shared by the department"}</span>
          {box.hidden && <span className="rounded bg-stone-200 px-1.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200">Hidden</span>}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[box.status]}`} data-testid="mailbox-status">{PILL_TEXT[box.status]}</span>
      </div>

      {connected && box.provider && (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300" data-testid="mailbox-account">
          {box.accountEmail} · {PROVIDER_TEXT[box.provider]} · {box.canRead ? "reading and sending allowed" : box.provider === "SMTP" ? "sending only" : "sending only (reading wasn't allowed)"}
        </p>
      )}
      {box.lastError && box.status !== "ACTIVE" && <p className="mt-1 text-sm text-red-700 dark:text-red-400">{box.lastError}</p>}
      {msg.ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" role="status" data-testid="mailbox-flash">{msg.ok}</p>}
      {msg.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert" data-testid="mailbox-error">{msg.error}</p>}

      {box.rights.connect && (
        <details className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700" open={open || box.status !== "ACTIVE"} data-testid="connect-guide">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">{connected ? "Reconnect or change the email address" : "Connect it"}</summary>
          <div className="space-y-4 border-t border-slate-200 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-50">What this does</p>
              <p>Plugs {orgName}&apos;s own email address into this mailbox, so {deptLabel} can read and send mail from the address your customers and suppliers already know. Your email stays with your provider; we only borrow permission to read and send.</p>
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-50">What it costs</p>
              <p>Nothing extra. It uses the email account you already have.</p>
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-50">Steps</p>
              <ol className="ml-5 list-decimal space-y-1">
                <li>Choose where your email lives below (Google, Microsoft, or another host).</li>
                <li>Sign in with the account for this mailbox{mine ? "" : `, for example the shared ${deptLabel.toLowerCase()} address rather than your own`}.</li>
                <li>Approve both permissions the provider shows: <strong>send email</strong> and <strong>read email</strong>. Leave both ticked.</li>
                <li>Come back here and press <strong>Check connection</strong>. A test email is sent to you.</li>
              </ol>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {providers.map((p) =>
                p.configured ? (
                  <a key={p.key} href={`${p.href}${p.href.includes("?") ? "&" : "?"}mailbox=${box.id}&dept=${dept}`} className="block rounded-lg border border-slate-300 px-4 py-3 hover:border-emerald-500 dark:border-slate-700" data-testid={`connect-${p.key.toLowerCase()}`}>
                    <span className="block font-semibold text-slate-900 dark:text-slate-50">{p.label}</span>
                    <span className="block text-xs text-slate-500">{p.sub}</span>
                  </a>
                ) : (
                  <div key={p.key} className="rounded-lg border border-dashed border-slate-300 px-4 py-3 opacity-70 dark:border-slate-700">
                    <span className="block font-semibold text-slate-900 dark:text-slate-50">{p.label}</span>
                    <span className="block text-xs text-slate-500">Not switched on for this platform yet.</span>
                  </div>
                ),
              )}
            </div>
            <OtherMailboxForm dept={dept} id={box.id} />
            <p className="text-xs text-slate-500">Need help? Open <Link className="underline" href="/dashboard/support">Support</Link> and send us a message; we&apos;ll walk you through it.</p>
          </div>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {box.status === "ACTIVE" && (box.rights.connect || box.rights.send) && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={() => run(() => testMailboxAction(dept, box.id))} data-testid="mailbox-test">Check connection</button>
        )}
        {box.rights.manage && connected && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={() => run(() => disconnectMailboxAction(dept, box.id), "Disconnect this email address from the mailbox? The mail already here stays.")} data-testid="mailbox-disconnect">Disconnect</button>
        )}
        {box.rights.manage && (
          <button type="button" className={ghostBtn} disabled={pending} onClick={() => run(() => hideMailboxAction(dept, box.id, !box.hidden))} data-testid="mailbox-hide">{box.hidden ? "Bring it back" : "Hide this mailbox"}</button>
        )}
      </div>

      {box.rights.manage && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={`rename-${box.id}`} className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Name</label>
            <input id={`rename-${box.id}`} className={field} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <button type="button" className={ghostBtn} disabled={pending || !name.trim() || name.trim() === box.name} onClick={() => run(() => renameMailboxAction(dept, box.id, name))} data-testid="mailbox-rename">Rename</button>
        </div>
      )}

      {box.rights.connect && box.status === "ACTIVE" && !mine && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <ShareText text={share} />
        </div>
      )}
    </section>
  );
}
