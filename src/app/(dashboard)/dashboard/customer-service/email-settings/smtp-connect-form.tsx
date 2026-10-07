"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectSmtp, detectMailbox } from "@/app/actions/customer-service";
import type { Detected } from "@/lib/email-smtp";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

/** "Other mailbox": type the address; we work out the mail host, you add the password. Google and Microsoft addresses are pointed to their one-click sign-in. */
export function SmtpConnectForm({ googleHref, microsoftHref, googleOn, microsoftOn }: { googleHref: string; microsoftHref: string; googleOn: boolean; microsoftOn: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [detected, setDetected] = useState<Detected | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function detect() {
    setError("");
    if (!email.trim()) return;
    startTransition(async () => {
      const r = await detectMailbox(email);
      if (r.error) { setError(r.error); setDetected(null); return; }
      const d = r.detected!;
      setDetected(d);
      if (d.kind === "SMTP") { setHost(d.host); setPort(String(d.port || 587)); }
    });
  }

  function connect() {
    setError("");
    startTransition(async () => {
      const r = await connectSmtp(email, password, host, Number(port));
      if (r.error) setError(r.error);
      else { setPassword(""); router.push("/dashboard/customer-service/email-settings?connected=1"); router.refresh(); }
    });
  }

  const redirectTo = detected && detected.kind !== "SMTP";
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700" data-testid="smtp-form">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-50">Connect any other mailbox</p>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="smtp-email" className="mb-1 block text-sm">Email address</label>
          <input id="smtp-email" type="email" autoComplete="off" className={field} placeholder="payables@yourcompany.com" value={email} onChange={(e) => { setEmail(e.target.value); setDetected(null); }} onBlur={detect} />
        </div>
        {detected && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100" data-testid="smtp-detected">
            {redirectTo ? (
              <>
                This address is hosted by <strong>{detected.label}</strong>, so there is a simpler way: use the one-click sign-in above
                {detected.kind === "GOOGLE" ? (googleOn ? <> (<a className="underline" href={googleHref}>Connect with Google</a>).</> : ".") : microsoftOn ? <> (<a className="underline" href={microsoftHref}>Connect with Microsoft</a>).</> : "."}
              </>
            ) : (
              <>Looks like <strong>{detected.label}</strong>. We filled in the mail server below; change it if your provider gave you different details.{detected.note ? ` ${detected.note}` : ""}</>
            )}
          </p>
        )}
        {!redirectTo && (
          <>
            <div>
              <label htmlFor="smtp-password" className="mb-1 block text-sm">Password (or app password)</label>
              <input id="smtp-password" type="password" autoComplete="new-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Stored encrypted and used only to send your customer emails.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <div>
                <label htmlFor="smtp-host" className="mb-1 block text-sm">Mail server</label>
                <input id="smtp-host" className={field} placeholder="smtp.yourhost.com" value={host} onChange={(e) => setHost(e.target.value)} />
              </div>
              <div>
                <label htmlFor="smtp-port" className="mb-1 block text-sm">Port</label>
                <select id="smtp-port" className={field} value={port} onChange={(e) => setPort(e.target.value)}>
                  <option value="465">465 (SSL)</option>
                  <option value="587">587 (TLS)</option>
                  <option value="2525">2525</option>
                </select>
              </div>
            </div>
            <button type="button" disabled={pending || !email || !password || !host} onClick={connect} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50" data-testid="smtp-connect">
              {pending ? "Checking the login…" : "Connect this mailbox"}
            </button>
          </>
        )}
        {error && <p role="alert" data-testid="smtp-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      </div>
    </div>
  );
}
