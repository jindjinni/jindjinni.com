"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetEmailTemplate, saveEmailTemplate } from "@/app/actions/customer-service";
import { PLACEHOLDERS, renderTemplate, SAMPLE_VALUES, validateTemplate, type AttachKind, type TemplateKey } from "@/lib/email-templates";
import { textToHtml } from "@/lib/receiving-emails";

export type TemplateRow = {
  key: TemplateKey;
  label: string;
  usedWhen: string;
  automatic: boolean;
  subject: string;
  body: string;
  edited: boolean;
  defaultSubject: string;
  defaultBody: string;
  attachKinds: AttachKind[];
};

const ATTACH_LABEL: Record<AttachKind, string> = {
  PAYMENT_CONFIRMATION: "the payment receipt from Accounts",
  REVISED_INVOICE: "the revised invoice / adjusted quotation",
  CUSTOMER_NOTE: "the photos Receiving added for the customer",
};
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

function Editor({ row, company, websiteUrl, guideUrl }: { row: TemplateRow; company: string; websiteUrl: string; guideUrl: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState(row.subject);
  const [body, setBody] = useState(row.body);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const id = `tpl-${row.key}`;

  const problems = validateTemplate(row.key, { subject, body });
  const dirty = subject !== row.subject || body !== row.body;
  const atDefault = subject === row.defaultSubject && body === row.defaultBody;
  const preview = renderTemplate({ subject, body }, { ...SAMPLE_VALUES, company, websiteUrl: websiteUrl || SAMPLE_VALUES.websiteUrl, packagingGuideUrl: guideUrl || SAMPLE_VALUES.packagingGuideUrl });

  function insert(name: string) {
    const el = bodyRef.current;
    const token = `{${name}}`;
    if (!el) return setBody((b) => b + token);
    const a = el.selectionStart ?? body.length;
    const z = el.selectionEnd ?? body.length;
    setBody(body.slice(0, a) + token + body.slice(z));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, done: string, after?: () => void) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        setMessage(done);
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-slate-800/70">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        <span className="font-medium">Used when:</span> {row.usedWhen}{" "}
        {row.automatic ? "It is chosen automatically from what Receiving answered; nobody has to pick it." : "It is only sent when an agent presses the button."}
      </p>
      <div>
        <label htmlFor={`${id}-subject`} className="mb-1 block text-sm font-medium">Subject</label>
        <input id={`${id}-subject`} className={field} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label htmlFor={`${id}-body`} className="mb-1 block text-sm font-medium">Email text</label>
        <textarea id={`${id}-body`} ref={bodyRef} className={`${field} font-mono`} rows={16} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
        <p className="mt-1 text-xs text-slate-500">Leave a blank line between paragraphs. <code>**bold**</code> and <code>[words](https://link)</code> work. Click a placeholder to put it where the cursor is.</p>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Placeholders">
          {PLACEHOLDERS.map((p) => (
            <button key={p.name} type="button" title={p.means} onClick={() => insert(p.name)} className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-mono hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
              {`{${p.name}}`}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        <span className="font-medium">Attached automatically:</span>{" "}
        {row.attachKinds.length ? row.attachKinds.map((k) => ATTACH_LABEL[k]).join(", ") : "nothing"}. Notes and files come over from Receiving and Accounts; they aren&apos;t part of the wording.
      </p>
      <div>
        <p className="mb-1 text-sm font-medium">Preview with sample details</p>
        <p className="mb-1 text-xs text-slate-600 dark:text-slate-300" data-testid={`${id}-preview-subject`}>Subject: {preview.subject}</p>
        <iframe title={`${row.label} preview`} sandbox="" srcDoc={textToHtml(preview.text)} className="h-72 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
      </div>
      {problems.length > 0 && (
        <ul role="alert" data-testid={`${id}-problems`} className="list-disc space-y-0.5 rounded-lg bg-amber-50 py-2 pl-7 pr-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !dirty || problems.length > 0} onClick={() => run(() => saveEmailTemplate(row.key, subject, body), "Saved. New emails use this wording.")} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50" data-testid={`${id}-save`}>
          {pending ? "Saving…" : "Save this template"}
        </button>
        {confirmReset ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span>Put the original wording back?</span>
            <button type="button" disabled={pending} onClick={() => run(() => resetEmailTemplate(row.key), "The original wording is back.", () => { setSubject(row.defaultSubject); setBody(row.defaultBody); setConfirmReset(false); })} className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900" data-testid={`${id}-reset-confirm`}>Yes, put it back</button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700">Cancel</button>
          </span>
        ) : (
          <button type="button" disabled={pending || (!row.edited && atDefault)} onClick={() => setConfirmReset(true)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" data-testid={`${id}-reset`}>
            Put the original wording back
          </button>
        )}
      </div>
    </div>
  );
}

/** The email templates, as closed headings (one per template) that open into an editor with a live preview. */
export function EmailTemplatesEditor({ rows, company, websiteUrl, guideUrl }: { rows: TemplateRow[]; company: string; websiteUrl: string; guideUrl: string }) {
  return (
    <section aria-label="Email templates" className="mt-10">
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Email templates</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        The wording of each customer email. Receiving decides which one applies: if &ldquo;Adjustment needed&rdquo; is chosen, an adjustment email is used; if not, the standard one. If the packaging was not acceptable, the packaging version is used. The agent&apos;s note and the photos and receipts attached in Receiving and Accounts are added automatically. Every email must keep the {"{website}"} line, so customers always see where to submit new orders.
      </p>
      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {rows.map((r) => (
          <details key={r.key} data-testid="tpl" className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <span aria-hidden className="text-[10px] text-slate-400 transition group-open:rotate-90">▶</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{r.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.edited ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}>{r.edited ? "Edited" : "Original wording"}</span>
              <span className="min-w-0 flex-1 basis-64 truncate text-xs text-slate-500">{r.usedWhen}</span>
            </summary>
            <Editor row={r} company={company} websiteUrl={websiteUrl} guideUrl={guideUrl} />
          </details>
        ))}
      </div>
    </section>
  );
}
