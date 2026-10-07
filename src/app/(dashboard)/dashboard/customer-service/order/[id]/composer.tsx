"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveCustomerNote, sendPackagingWarningEmail, sendPaymentEmail } from "@/app/actions/customer-service";
import type { EmailDraft, SentEmail } from "@/lib/customer-service-queries";
import { TEMPLATE_LABEL } from "@/lib/customer-service-rules";
import { MONEY } from "@/lib/receiving-ui";

const subscribe = () => () => {};
const KIND_LABEL: Record<string, string> = {
  PAYMENT_CONFIRMATION: "Payment receipt",
  REVISED_INVOICE: "Revised invoice",
  CUSTOMER_NOTE: "Note for the customer",
};

function when(stamp: string | null) {
  const m = stamp ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(stamp) : null;
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function EmailFrame({ html, title }: { html: string; title: string }) {
  return <iframe title={title} sandbox="" srcDoc={html} className="h-[28rem] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />;
}

function SentCard({ e }: { e: SentEmail }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="sent-email">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-slate-900 dark:text-slate-50">{e.kind === "WARNING" ? "Packaging warning" : "Payment email"}</span>
        <span className="text-slate-600 dark:text-slate-300">{when(e.sentAt)}</span>
        <span className="text-slate-600 dark:text-slate-300">by {e.sentByName ?? "unknown"}</span>
        <span className="text-slate-600 dark:text-slate-300">to {e.toEmail}</span>
        {e.sentFrom && <span className="text-slate-600 dark:text-slate-300">from {e.sentFrom}</span>}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="ml-auto text-emerald-800 underline dark:text-emerald-300">
          {open ? "Hide the email" : "Show the email"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-slate-800 dark:text-slate-100"><span className="font-medium">Subject:</span> {e.subject}</p>
          {e.bccEmails && <p className="text-xs text-slate-500">Hidden copy to: {e.bccEmails}</p>}
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Attached: {e.attachmentNames.length ? e.attachmentNames.join(", ") : "nothing"}
            {e.skippedAttachments > 0 && ` (${e.skippedAttachments} file(s) were too large or unavailable and were left off)`}
          </p>
          <EmailFrame html={e.bodyHtml} title={`Email sent ${when(e.sentAt)}`} />
        </div>
      )}
    </li>
  );
}

export function Composer({ draft }: { draft: EmailDraft }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [note, setNote] = useState(draft.note);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<"resend" | "warning" | null>(null);
  const dirty = note.trim() !== draft.note.trim();
  const sent = draft.alreadyEmailed;

  function run(fn: () => Promise<{ ok?: boolean; error?: string; notice?: string }>) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const r = await fn();
      setConfirming(null);
      if (r.error) setError(r.error);
      else {
        setMessage(r.notice ?? "Done.");
        router.refresh();
      }
    });
  }

  // The note is saved first, then the preview refreshes so the agent sees the real email with the note in it.
  const saveNote = () => run(() => saveCustomerNote(draft.packageId, note));
  const send = () =>
    run(async () => {
      if (dirty) {
        const s = await saveCustomerNote(draft.packageId, note);
        if (s.error) return s;
      }
      return sendPaymentEmail(draft.packageId, false);
    });

  const blocked = !draft.ready;
  return (
    <div className="mt-3 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{draft.customerName} — {draft.quotationNumber}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{draft.to ?? "No email address on the order"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${sent ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100" : draft.ready ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"}`} data-testid="cs-status">
          {sent ? "Emailed" : draft.ready ? "Ready to send" : "Needs attention"}
        </span>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Payment">
        <h2 className="font-semibold text-slate-900 dark:text-slate-50">Payment</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Paid: </dt><dd className="inline" data-testid="cs-paid-at">{when(draft.paidAt) || "—"}</dd></div>
          <div><dt className="inline text-slate-500">Method: </dt><dd className="inline">ACH direct deposit</dd></div>
          <div>
            <dt className="inline text-slate-500">Amount: </dt>
            <dd className="inline font-semibold tabular-nums">{MONEY.format(draft.amount)}</dd>
            {draft.adjusted && <span className="ml-2 text-xs text-slate-500">(quoted {MONEY.format(draft.originalAmount)})</span>}
          </div>
          <div>
            <dt className="inline text-slate-500">Receipt: </dt>
            <dd className="inline">
              {draft.receiptId ? <a href={`/api/receiving/photos/${draft.receiptId}`} target="_blank" rel="noreferrer" className="text-emerald-800 underline dark:text-emerald-300">Open the payment receipt</a> : <span className="text-amber-800 dark:text-amber-300">Not attached yet</span>}
            </dd>
          </div>
        </dl>
      </section>

      {!sent && blocked && (
        <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="cs-blockers">
          <p className="font-semibold">This email can&apos;t be sent yet:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {draft.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </section>
      )}

      <section aria-label="The email">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900 dark:text-slate-50">The email</h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100" data-testid="cs-template">{TEMPLATE_LABEL[draft.template] ?? draft.template}</span>
        </div>
        <p className="mt-2 text-sm text-slate-800 dark:text-slate-100" data-testid="cs-subject"><span className="font-medium">Subject:</span> {draft.subject}</p>
        <p className="text-xs text-slate-500" data-testid="cs-from">From: {draft.from.address ? `${draft.from.name} <${draft.from.address}>` : `${draft.from.name} (the platform's sending address)`}</p>
        <p className="text-xs text-slate-500">To: {draft.to ?? "—"}{draft.bcc.length > 0 && ` · hidden copy to ${draft.bcc.join(", ")}`}</p>
        <div className="mt-2">{ready ? <EmailFrame html={draft.bodyHtml} title="Email preview" /> : <p className="text-sm text-slate-500">Loading the preview…</p>}</div>
      </section>

      <section aria-label="Note to the customer">
        <label htmlFor="cs-note" className="font-semibold text-slate-900 dark:text-slate-50">Note to the customer</label>
        <p className="text-xs text-slate-500">This is the only part you can change. The rest of the email is fixed wording.</p>
        <textarea
          id="cs-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          readOnly={sent}
          maxLength={4000}
          rows={4}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm read-only:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:read-only:bg-slate-800"
          placeholder={draft.isAdjustment ? "Say what the adjustment is for." : "Optional: add a short note for the customer."}
        />
        {!sent && (
          <button type="button" onClick={saveNote} disabled={pending || !dirty} className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            Save note and update preview
          </button>
        )}
      </section>

      <section aria-label="Attachments" className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-900 dark:text-slate-50">Attachments</h2>
        {draft.attachments.length === 0 && !draft.adjustmentPdf ? (
          <p className="mt-1 text-slate-500">Nothing will be attached.</p>
        ) : (
          <ul className="mt-2 space-y-1" data-testid="cs-attachments">
            {draft.attachments.map((a) => (
              <li key={a.id}>
                <a href={`/api/receiving/photos/${a.id}`} target="_blank" rel="noreferrer" className="text-emerald-800 underline dark:text-emerald-300">{a.filename}</a>
                <span className="ml-2 text-xs text-slate-500">{KIND_LABEL[a.kind] ?? "Photo"}</span>
              </li>
            ))}
            {draft.adjustmentPdf && (
              <li>
                <a href={`/api/receiving/adjustments/${draft.adjustmentPdf.id}/pdf`} target="_blank" rel="noreferrer" className="text-emerald-800 underline dark:text-emerald-300">Adjusted quotation {draft.adjustmentPdf.number} (PDF)</a>
                <span className="ml-2 text-xs text-slate-500">Adjustment documentation</span>
              </li>
            )}
          </ul>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{message}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {!sent ? (
          <button type="button" onClick={send} disabled={pending || blocked} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" data-testid="cs-send">
            {pending ? "Sending…" : "Send email to customer"}
          </button>
        ) : confirming === "resend" ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span>Send this email to {draft.to} again?</span>
            <button type="button" onClick={() => run(() => sendPaymentEmail(draft.packageId, true))} disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50" data-testid="cs-resend-confirm">Yes, resend</button>
            <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Cancel</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming("resend")} disabled={pending || blocked} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" data-testid="cs-resend">
            Resend the email
          </button>
        )}

        {draft.packagingNotAcceptable && (confirming === "warning" ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span>Send the packaging warning to {draft.to}?</span>
            <button type="button" onClick={() => run(() => sendPackagingWarningEmail(draft.packageId))} disabled={pending} className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50" data-testid="cs-warning-confirm">Yes, send</button>
            <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Cancel</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming("warning")} disabled={pending || !draft.emailsEnabled || !draft.to} className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="cs-warning">
            {draft.packagingWarningSentAt ? "Send the packaging warning again" : "Send a packaging warning"}
          </button>
        ))}
      </div>

      <section aria-label="Emails sent for this order">
        <h2 className="font-semibold text-slate-900 dark:text-slate-50">Emails sent for this order</h2>
        {draft.history.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Nothing has been sent yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">{draft.history.map((e) => <SentCard key={e.id} e={e} />)}</ul>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Need to change the order, the adjustment or the receipt? That happens in Receiving and Accounts. <Link href="/dashboard/customer-service" className="underline">Back to the list</Link>
      </p>
    </div>
  );
}
