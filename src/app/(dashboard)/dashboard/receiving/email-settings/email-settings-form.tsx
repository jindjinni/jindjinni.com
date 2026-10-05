"use client";

import { useState, useTransition } from "react";
import { saveReceivingSettings } from "@/app/actions/receiving";

type Initial = { emailsEnabled: boolean; fromName: string; replyTo: string; bccEmails: string; quoteLinkUrl: string; packagingGuideUrl: string };

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export function EmailSettingsForm({ initial, companyName }: { initial: Initial; companyName: string }) {
  const [v, setV] = useState<Initial>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((p) => ({ ...p, [k]: val }));

  function save() {
    setError("");
    setMessage("");
    const fd = new FormData();
    fd.set("emailsEnabled", String(v.emailsEnabled));
    fd.set("fromName", v.fromName);
    fd.set("replyTo", v.replyTo);
    fd.set("bccEmails", v.bccEmails);
    fd.set("quoteLinkUrl", v.quoteLinkUrl);
    fd.set("packagingGuideUrl", v.packagingGuideUrl);
    startTransition(async () => {
      const res = await saveReceivingSettings(fd);
      if (res.error) setError(res.error);
      else setMessage("Saved.");
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-600" checked={v.emailsEnabled} onChange={(e) => set("emailsEnabled", e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold">Send customer emails</span>
          <span className="block text-xs text-slate-500">
            When on, the customer is emailed automatically the first time a submitted shipment is marked Paid. You can also send or resend from the shipment. Emails only go out from a verified sending domain.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="fromName" className="mb-1 block text-sm font-medium">Sender name</label>
        <input id="fromName" className={field} maxLength={80} placeholder={companyName} value={v.fromName} onChange={(e) => set("fromName", e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">Shown as the sender and used in the subject line. Leave blank to use your company name.</p>
      </div>
      <div>
        <label htmlFor="replyTo" className="mb-1 block text-sm font-medium">Reply-to address</label>
        <input id="replyTo" type="email" className={field} maxLength={200} value={v.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">Where customer replies go.</p>
      </div>
      <div>
        <label htmlFor="bccEmails" className="mb-1 block text-sm font-medium">Hidden copies (BCC)</label>
        <input id="bccEmails" className={field} maxLength={500} placeholder="accounting@yourcompany.com, manager@yourcompany.com" value={v.bccEmails} onChange={(e) => set("bccEmails", e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">Up to 5 addresses, separated by commas. They get a copy of every customer email.</p>
      </div>
      <div>
        <label htmlFor="quoteLinkUrl" className="mb-1 block text-sm font-medium">Link to request a new quote</label>
        <input id="quoteLinkUrl" className={field} maxLength={500} placeholder="https://" value={v.quoteLinkUrl} onChange={(e) => set("quoteLinkUrl", e.target.value)} />
      </div>
      <div>
        <label htmlFor="packagingGuideUrl" className="mb-1 block text-sm font-medium">Link to your packaging guide</label>
        <input id="packagingGuideUrl" className={field} maxLength={500} placeholder="https://" value={v.packagingGuideUrl} onChange={(e) => set("packagingGuideUrl", e.target.value)} />
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{message}</p>}
      <button onClick={save} disabled={pending} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
