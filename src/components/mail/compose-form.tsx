"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { composeAction } from "@/app/actions/mailbox";
import { field, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type ComposeDraft = {
  id: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  date: string;
  time: string;
  zone: string | null;
  scheduled: boolean;
  files: { id: string; filename: string; bytes: number }[];
  /** The received email this one answers, if it is a reply. */
  replyTo: string | null;
};

const noSubscribe = () => () => {};
const pad = (n: number) => String(n).padStart(2, "0");
const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Write an email: To/Cc/Bcc, subject, message, files, and Send now, Send later or Save draft. Typed text is never lost when something fails. */
export function ComposeForm({
  dept, boxId, boxName, fromEmail, connected, draft,
}: {
  dept: string;
  boxId: string;
  boxName: string;
  fromEmail: string | null;
  connected: boolean;
  draft: ComposeDraft;
}) {
  const [pending, start] = useTransition();
  const [draftId, setDraftId] = useState<string | null>(draft.id);
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [bcc, setBcc] = useState(draft.bcc);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [when, setWhen] = useState<"now" | "later">(draft.scheduled ? "later" : "now");
  const [date, setDate] = useState(draft.date);
  const [time, setTime] = useState(draft.time);
  // The time zone the day and time are in: the one the email was scheduled in, else the browser's own.
  const browserZone = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", () => "");
  const zone = draft.zone || browserZone;
  const [remove, setRemove] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showCc, setShowCc] = useState(!!(draft.cc || draft.bcc));

  function pick(daysAhead: number, hour: number, toMonday = false) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    if (toMonday) while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    setWhen("later");
    setDate(dayString(d));
    setTime(`${pad(hour)}:00`);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "draft" ? "draft" : "send";
    const fd = new FormData(e.currentTarget);
    fd.set("intent", intent);
    fd.set("when", when);
    fd.set("zone", zone);
    if (draftId) fd.set("draft", draftId);
    remove.forEach((r) => fd.append("remove", r));
    setError("");
    start(async () => {
      const r = await composeAction({}, fd);
      if (r?.draftId) setDraftId(r.draftId);
      if (r?.error) setError(r.error);
    });
  }

  const labelCls = "mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200";
  const canSend = connected;
  const bigLabel = when === "later" ? "Schedule it" : "Send";

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="compose-form" encType="multipart/form-data">
      <input type="hidden" name="dept" value={dept} />
      <input type="hidden" name="mailbox" value={boxId} />
      {draft.replyTo && <input type="hidden" name="replyTo" value={draft.replyTo} />}
      <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="compose-from">
        From: <strong className="text-slate-900 dark:text-slate-100">{fromEmail ?? "not connected yet"}</strong> ({boxName})
      </p>
      {!connected && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" data-testid="compose-not-connected">
          This mailbox isn&apos;t connected yet, so it can&apos;t send. You can still save a draft.{" "}
          <Link href={`/dashboard/${dept}/mail/settings?box=${boxId}`} className="font-semibold underline">
            Connect it
          </Link>
        </p>
      )}
      <div>
        <label htmlFor="mail-to" className={labelCls}>
          To
        </label>
        <input id="mail-to" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={field} placeholder="name@company.com, another@company.com" autoComplete="off" data-testid="compose-to" />
      </div>
      {showCc ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mail-cc" className={labelCls}>
              Cc
            </label>
            <input id="mail-cc" name="cc" value={cc} onChange={(e) => setCc(e.target.value)} className={field} autoComplete="off" data-testid="compose-cc" />
          </div>
          <div>
            <label htmlFor="mail-bcc" className={labelCls}>
              Bcc (hidden copy)
            </label>
            <input id="mail-bcc" name="bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} className={field} autoComplete="off" data-testid="compose-bcc" />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowCc(true)} className="text-sm font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="show-cc">
          Add Cc or Bcc
        </button>
      )}
      <div>
        <label htmlFor="mail-subject" className={labelCls}>
          Subject
        </label>
        <input id="mail-subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={field} maxLength={200} data-testid="compose-subject" />
      </div>
      <div>
        <label htmlFor="mail-body" className={labelCls}>
          Message
        </label>
        <textarea id="mail-body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={field} data-testid="compose-body" />
      </div>

      <div>
        <label htmlFor="mail-files" className={labelCls}>
          Files <span className="font-normal text-slate-500">(up to 8 files, 8 MB together)</span>
        </label>
        {draft.files.length > 0 && (
          <ul className="mb-2 space-y-1" data-testid="compose-existing-files">
            {draft.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" id={`rm-${f.id}`} checked={!remove.includes(f.id)} onChange={(e) => setRemove((r) => (e.target.checked ? r.filter((x) => x !== f.id) : [...r, f.id]))} />
                <label htmlFor={`rm-${f.id}`}>
                  📎 {f.filename} <span className="text-xs text-slate-500">{kb(f.bytes)}</span>
                  {remove.includes(f.id) && <span className="ml-2 text-xs text-red-700">will be removed</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <input id="mail-files" type="file" name="files" multiple className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm dark:text-slate-300" data-testid="compose-files" />
      </div>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-slate-50">When should it go out?</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when-choice" checked={when === "now"} onChange={() => setWhen("now")} data-testid="when-now" /> Send now
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="when-choice" checked={when === "later"} onChange={() => { setWhen("later"); if (!date) pick(1, 8); }} data-testid="when-later" /> Send later
          </label>
        </div>
        {when === "later" && (
          <div className="space-y-3" data-testid="schedule-fields">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="mail-date" className={labelCls}>
                  Day
                </label>
                <input id="mail-date" type="date" name="date" value={date} min={dayString(new Date())} onChange={(e) => setDate(e.target.value)} className={field} data-testid="schedule-date" />
              </div>
              <div>
                <label htmlFor="mail-time" className={labelCls}>
                  Time
                </label>
                <input id="mail-time" type="time" name="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} data-testid="schedule-time" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className={ghostBtn} onClick={() => pick(1, 8)}>
                Tomorrow 8:00 AM
              </button>
              <button type="button" className={ghostBtn} onClick={() => pick(1, 13)}>
                Tomorrow 1:00 PM
              </button>
              <button type="button" className={ghostBtn} onClick={() => pick(1, 8, true)}>
                Monday 8:00 AM
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Times are in your time zone{zone ? ` (${zone.replace(/_/g, " ")})` : ""}. A scheduled email goes out within a minute or two of that time.</p>
          </div>
        )}
      </fieldset>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert" data-testid="compose-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" value="send" className={primaryBtn} disabled={pending || !canSend} data-testid="compose-send">
          {pending ? "Working…" : bigLabel}
        </button>
        <button type="submit" value="draft" className={ghostBtn} disabled={pending} data-testid="compose-save-draft">
          Save draft
        </button>
        <Link href={`/dashboard/${dept}/mail?box=${boxId}`} className={ghostBtn}>
          Close
        </Link>
      </div>
    </form>
  );
}
