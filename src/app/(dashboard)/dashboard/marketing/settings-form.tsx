"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/actions/marketing";
import { card, field, primaryBtn } from "@/components/sales-ui";

type Values = { senderName: string; replyTo: string; businessAddress: string; footerText: string; dailyEmailLimit: string; textFromNumber: string; textOptOutLine: string };

/** Email Settings (who emails come from, the address printed on them, the daily limit) and Text Settings (the future provider and number). One form, two screens; each saves only its own fields. */
export function SettingsForm({ kind, orgName, values }: { kind: "email" | "text"; orgName: string; values: Values }) {
  const [v, setV] = useState(values);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const save = () =>
    start(async () => {
      const r = await saveSettingsAction({
        // The screen that isn't open keeps what was saved.
        senderName: kind === "email" ? v.senderName : values.senderName,
        replyTo: kind === "email" ? v.replyTo : values.replyTo,
        businessAddress: kind === "email" ? v.businessAddress : values.businessAddress,
        footerText: kind === "email" ? v.footerText : values.footerText,
        dailyEmailLimit: Number(kind === "email" ? v.dailyEmailLimit : values.dailyEmailLimit),
        textFromNumber: kind === "text" ? v.textFromNumber : values.textFromNumber,
        textOptOutLine: kind === "text" ? v.textOptOutLine : values.textOptOutLine,
      });
      setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error });
    });

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{kind === "email" ? "Email settings" : "Text settings"}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{kind === "email" ? "How your marketing emails look and who they come from." : "Set up for later: the number your text campaigns will come from."}</p>
      </div>
      {kind === "email" ? (
        <div className={`${card} space-y-4`} data-testid="mk-email-settings">
          <div>
            <label htmlFor="s-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">From name</label>
            <input id="s-name" value={v.senderName} onChange={set("senderName")} placeholder={orgName} className={`${field} mt-1`} data-testid="s-name" />
            <p className="mt-1 text-xs text-slate-500">What people see as the sender. Blank uses {orgName}.</p>
          </div>
          <div>
            <label htmlFor="s-reply" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Reply-to email</label>
            <input id="s-reply" value={v.replyTo} onChange={set("replyTo")} className={`${field} mt-1`} data-testid="s-reply" />
            <p className="mt-1 text-xs text-slate-500">Where replies go. Emails are sent from your connected mailbox (see Customer Service → Email Settings) or from the platform address.</p>
          </div>
          <div>
            <label htmlFor="s-address" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Business mailing address (required)</label>
            <textarea id="s-address" value={v.businessAddress} onChange={set("businessAddress")} rows={3} className={`${field} mt-1`} data-testid="s-address" />
            <p className="mt-1 text-xs text-slate-500">Printed at the bottom of every marketing email, as email law requires.</p>
          </div>
          <div>
            <label htmlFor="s-footer" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Extra footer line (optional)</label>
            <input id="s-footer" value={v.footerText} onChange={set("footerText")} className={`${field} mt-1`} data-testid="s-footer" />
          </div>
          <div>
            <label htmlFor="s-limit" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Most emails to send in 24 hours</label>
            <input id="s-limit" inputMode="numeric" value={v.dailyEmailLimit} onChange={set("dailyEmailLimit")} className={`${field} mt-1 !w-32`} data-testid="s-limit" />
            <p className="mt-1 text-xs text-slate-500">A safety limit (up to 2,000). Mailboxes such as Gmail have their own daily caps, so start small.</p>
          </div>
        </div>
      ) : (
        <div className={`${card} space-y-4`} data-testid="mk-text-settings">
          <p className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200" data-testid="s-text-status">
            <span className="font-semibold">Not connected.</span> Text campaigns can be written and saved, but nothing is sent until a text provider is connected. Business texting also needs your own registered number and a clear &ldquo;yes, text me&rdquo; from each person.
          </p>
          <div>
            <label htmlFor="s-from" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Number texts will come from</label>
            <input id="s-from" value={v.textFromNumber} onChange={set("textFromNumber")} placeholder="(334) 555-0100" className={`${field} mt-1 !w-56`} data-testid="s-from" />
          </div>
          <div>
            <label htmlFor="s-optout" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Opt-out line added to every text</label>
            <input id="s-optout" value={v.textOptOutLine} onChange={set("textOptOutLine")} className={`${field} mt-1`} data-testid="s-optout" />
            <p className="mt-1 text-xs text-slate-500">Left off only when your message already says STOP.</p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className={primaryBtn} disabled={pending} onClick={save} data-testid="s-save">Save</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "mk-msg-ok" : "mk-msg-err"}>{msg.text}</span>}
        <Link href="/dashboard/marketing" className="text-sm text-slate-600 underline dark:text-slate-400">Back to Contacts</Link>
      </div>
    </div>
  );
}
