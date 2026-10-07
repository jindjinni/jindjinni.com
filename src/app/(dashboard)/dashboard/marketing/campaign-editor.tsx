"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteCampaignAction, previewAudienceAction, saveCampaignAction, sendBatchAction, sendTestAction } from "@/app/actions/marketing";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";
import { AUDIENCE_LABELS, buildEmail, buildText, emailProblem, MAX_SUBJECT, MAX_TEXT_BODY, MERGE_FIELDS, smsInfo, unknownFields, type Audience, type Channel } from "@/lib/marketing-rules";

export type CampaignView = { id: string | null; channel: Channel; name: string; subject: string; body: string; audience: Audience; status: string };

type Props = {
  campaign: CampaignView;
  base: string;
  textReady: boolean;
  addressOk: boolean;
  dailyLimit: number;
  sentToday: number;
  company: string;
  senderName: string;
  businessAddress: string;
  footerText: string;
  optOutLine: string;
  myEmail: string;
  initialReach: number;
};

type Reach = { reach: number; noAddress: number; optedOut: number; duplicates: number; cut: number };

export function CampaignEditor(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [id, setId] = useState(p.campaign.id);
  const [name, setName] = useState(p.campaign.name);
  const [subject, setSubject] = useState(p.campaign.subject);
  const [body, setBody] = useState(p.campaign.body);
  const [audience, setAudience] = useState<Audience>(p.campaign.audience);
  const [reach, setReach] = useState<Reach>({ reach: p.initialReach, noAddress: 0, optedOut: 0, duplicates: 0, cut: 0 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState(p.myEmail);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState<{ sent: number; failed: number; skipped: number; pending: number } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const isEmail = p.campaign.channel === "EMAIL";
  const word = isEmail ? "email" : "text";

  useEffect(() => {
    let live = true;
    previewAudienceAction(p.campaign.channel, audience).then((r) => {
      if (live && r.ok) setReach(r);
    });
    return () => {
      live = false;
    };
  }, [audience, p.campaign.channel]);

  const insert = (field: string) => {
    const el = bodyRef.current;
    const tag = `{${field}}`;
    if (!el) return setBody(body + tag);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + tag + body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + tag.length, s + tag.length);
    });
  };

  const person = { firstName: "Alex", lastName: "Sample" };
  const mail = isEmail
    ? buildEmail({ subject, body, person, company: p.company, settings: { senderName: p.senderName || null, businessAddress: p.businessAddress || null, footerText: p.footerText || null }, unsubscribeUrl: "https://example.com/unsubscribe/…" })
    : null;
  const textOut = !isEmail ? buildText(body, person, p.company, p.optOutLine) : "";
  const sms = smsInfo(textOut);
  const bad = unknownFields(`${subject} ${body}`);
  const problem = isEmail ? emailProblem({ subject, body }, { businessAddress: p.businessAddress || null }, reach.reach, p.sentToday, p.dailyLimit) : null;

  const save = async (): Promise<string | null> => {
    const r = await saveCampaignAction({ id, channel: p.campaign.channel, name, subject, body, audience });
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return null;
    }
    setId(r.id ?? id);
    setMsg({ ok: true, text: "Saved." });
    if (!id && r.id) router.replace(`${p.base}/${r.id}`);
    return r.id ?? id;
  };

  const runSend = async (cid: string) => {
    setConfirming(false);
    setSending({ sent: 0, failed: 0, skipped: 0, pending: reach.reach });
    for (let i = 0; i < 400; i++) {
      const r = await sendBatchAction(cid);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        setSending(null);
        router.refresh();
        return;
      }
      setSending(r.progress);
      if (r.progress.done) break;
    }
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href={p.base} className="text-sm text-slate-600 underline dark:text-slate-400">‹ All {word} campaigns</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{id ? name || `${word} campaign` : `New ${word} campaign`}</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className={`${card} space-y-4`}>
            <div>
              <label htmlFor="mk-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Campaign name (only you see this)</label>
              <input id="mk-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={`${field} mt-1`} data-testid="mk-name" />
            </div>
            {isEmail && (
              <div>
                <label htmlFor="mk-subject" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Subject line</label>
                <input id="mk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} className={`${field} mt-1`} data-testid="mk-subject" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="mk-body" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Message</label>
                <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  Add:
                  {MERGE_FIELDS.map((f) => (
                    <button key={f} type="button" onClick={() => insert(f)} className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-white dark:border-slate-700 dark:hover:bg-slate-800" data-testid={`mk-insert-${f}`}>{`{${f}}`}</button>
                  ))}
                </span>
              </div>
              <textarea id="mk-body" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={isEmail ? 12 : 6} className={`${field} mt-1`} data-testid="mk-body" placeholder={isEmail ? "Hi {first_name},\n\nWe are paying top dollar for…" : "Hi {first_name}, we are paying top dollar for…"} />
              {!isEmail && (
                <p className="mt-1 text-xs text-slate-500" data-testid="mk-sms-count">
                  {sms.chars} characters · {sms.segments} {sms.segments === 1 ? "text" : "texts"} per person{sms.unicode ? " (emoji or special characters make each text shorter)" : ""}
                  {body.length > MAX_TEXT_BODY && <span className="text-red-700"> · too long</span>}
                </p>
              )}
              {bad.length > 0 && <p className="mt-1 text-xs text-red-700 dark:text-red-300" data-testid="mk-bad-field">{`{${bad[0]}}`} isn&apos;t a field we know. Use {"{first_name}"}, {"{last_name}"}, {"{name}"} or {"{company}"}.</p>}
            </div>
            <div>
              <label htmlFor="mk-audience" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Who gets it</label>
              <select id="mk-audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={`${field} mt-1`} data-testid="mk-audience">
                {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                  <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                ))}
              </select>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100" data-testid="mk-reach-now">{reach.reach} {reach.reach === 1 ? "person" : "people"} would get this {word}</p>
              <p className="text-xs text-slate-500" data-testid="mk-reach-detail">
                {reach.noAddress} without {isEmail ? "an email address" : "a phone number"} · {reach.optedOut} unsubscribed · {reach.duplicates} repeated {isEmail ? "addresses" : "numbers"} sent once{reach.cut ? ` · ${reach.cut} over the limit of one campaign` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={ghostBtn} disabled={pending || !!sending} onClick={() => start(async () => void (await save()))} data-testid="mk-save">Save draft</button>
            {id && (
              <button type="button" className="text-sm font-medium text-red-700 underline dark:text-red-300" disabled={pending || !!sending} data-testid="mk-delete-campaign" onClick={() => start(async () => { const r = await deleteCampaignAction(id); if (r.ok) router.push(p.base); else setMsg({ ok: false, text: r.error }); })}>Delete draft</button>
            )}
          </div>

          {isEmail ? (
            <div className={`${card} space-y-3`} data-testid="mk-send-box">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Send</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="mk-test-to" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Send a test to</label>
                  <input id="mk-test-to" value={testTo} onChange={(e) => setTestTo(e.target.value)} className={`${field} mt-1 !w-64`} data-testid="mk-test-to" />
                </div>
                <button type="button" className={ghostBtn} disabled={pending || !!sending || !!problem && !body.trim()} data-testid="mk-test" onClick={() => start(async () => { const cid = await save(); if (!cid) return; const r = await sendTestAction(cid, testTo); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Test sent." : r.error }); })}>Send test</button>
              </div>
              {problem && <p className="text-sm text-yellow-800 dark:text-yellow-300" data-testid="mk-problem">{problem}</p>}
              {!confirming && !sending && (
                <button type="button" className={primaryBtn} disabled={pending || !!problem} onClick={() => setConfirming(true)} data-testid="mk-send">Send to {reach.reach} {reach.reach === 1 ? "person" : "people"}</button>
              )}
              {confirming && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 p-3 dark:border-slate-700" data-testid="mk-confirm">
                  <p className="text-sm font-medium">Send this now to {reach.reach} {reach.reach === 1 ? "person" : "people"}? It can&apos;t be unsent.</p>
                  <button type="button" className={primaryBtn} disabled={pending} data-testid="mk-confirm-yes" onClick={() => start(async () => { const cid = await save(); if (cid) await runSend(cid); })}>Yes, send</button>
                  <button type="button" className={ghostBtn} onClick={() => setConfirming(false)} data-testid="mk-confirm-no">Not yet</button>
                </div>
              )}
              {sending && (
                <div data-testid="mk-progress" aria-live="polite">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-green-600" style={{ width: `${Math.round(((sending.sent + sending.failed + sending.skipped) / Math.max(1, sending.sent + sending.failed + sending.skipped + sending.pending)) * 100)}%` }} /></div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{sending.sent} sent · {sending.failed} failed · {sending.skipped} skipped · {sending.pending} to go. Keep this page open.</p>
                </div>
              )}
              <p className="text-xs text-slate-500">Today: {p.sentToday} of {p.dailyLimit} emails used in the last 24 hours.</p>
            </div>
          ) : (
            <div className={`${card} space-y-2`} data-testid="mk-text-send-box">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Send</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{p.textReady ? "Ready to send." : "Text messaging isn't connected yet, so this stays a draft. Your audience and message are saved for when it is."}</p>
              <button type="button" className={primaryBtn} disabled data-testid="mk-text-send">Send {reach.reach} {reach.reach === 1 ? "text" : "texts"} (not available yet)</button>
            </div>
          )}
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "mk-msg-ok" : "mk-msg-err"}>{msg.text}</p>}
        </div>

        <div className="space-y-2" data-testid="mk-preview">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview for &ldquo;Alex Sample&rdquo;</p>
          {isEmail && mail ? (
            <div className={`${card} !p-0`}>
              <p className="border-b border-slate-100 px-4 py-2 text-sm dark:border-slate-800"><span className="text-slate-500">Subject: </span><span className="font-medium text-slate-900 dark:text-slate-50" data-testid="mk-preview-subject">{mail.subject || "(no subject)"}</span></p>
              <pre className="whitespace-pre-wrap break-words px-4 py-3 font-sans text-sm text-slate-800 dark:text-slate-100" data-testid="mk-preview-body">{mail.text}</pre>
            </div>
          ) : (
            <div className="mx-auto max-w-xs rounded-2xl bg-slate-200 p-4 dark:bg-slate-800">
              <p className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-white p-3 text-sm text-slate-900 dark:bg-slate-700 dark:text-slate-50" data-testid="mk-preview-text">{textOut || "Your text will show here."}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
