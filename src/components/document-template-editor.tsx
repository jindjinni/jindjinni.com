"use client";

import { useRef, useState, useTransition } from "react";
import { removeTemplateLogoAction, saveTemplateAction, uploadTemplateLogoAction } from "@/app/actions/document-templates";
import { TEMPLATE_LIMITS } from "@/lib/document-template-rules";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
const lab = "text-sm font-medium text-slate-900 dark:text-slate-50";
const help = "mt-1 text-xs text-slate-500 dark:text-slate-400";
const primary = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";
const ghost = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900";

export type TemplateEditorInitial = {
  displayName: string;
  showLogo: boolean;
  titleText: string;
  introText: string;
  termsText: string;
  footerText: string;
  noticeText: string;
  noticeEnabled: boolean;
  noticeUntil: string;
};

export type TemplateEditorCopy = {
  /** "Quotation" / "Purchase order" -- used in the labels. */
  word: string;
  /** The title printed when the box is empty (e.g. PURCHASE ORDER). */
  defaultTitle: string;
  /** What the "terms" box is for in this document. */
  termsLabel: string;
  termsHelp: string;
  /** The company name / logo the document uses when this template sets none. */
  fallbackName: string;
  fallbackLogo: string | null;
};

/**
 * The editor for one document template (Quotation or Purchase Order, in Purchasing or Sales): name and logo, title and wording,
 * and the standing notice. `noticeOnly` shows just the notice (the Purchasing quotation keeps its name, logo and wording in the
 * Quotation Profile and the Quotation Receipt Layout). All fields are held in state, so a save never clears what was typed.
 */
export function DocumentTemplateEditor(props: {
  department: "purchasing" | "sales";
  docType: "QUOTATION" | "PURCHASE_ORDER";
  initial: TemplateEditorInitial;
  ownLogo: string | null;
  copy: TemplateEditorCopy;
  noticeOnly?: boolean;
  canEdit: boolean;
}) {
  const { department, docType, copy, noticeOnly, canEdit } = props;
  const [v, setV] = useState(props.initial);
  const [logo, setLogo] = useState<string | null>(props.ownLogo);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof TemplateEditorInitial>(k: K, val: TemplateEditorInitial[K]) => setV((p) => ({ ...p, [k]: val }));
  const id = (s: string) => `tpl-${department}-${docType}-${s}`;
  const shownLogo = logo ?? copy.fallbackLogo;
  const shownName = v.displayName.trim() || copy.fallbackName;

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveTemplateAction(department, docType, v);
      setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "Saved." });
    });

  const upload = () =>
    start(async () => {
      setMsg(null);
      const f = fileRef.current?.files?.[0];
      if (!f) return setMsg({ ok: false, text: "Choose a PNG or JPG image to upload." });
      const fd = new FormData();
      fd.set("logo", f);
      const r = await uploadTemplateLogoAction(department, docType, fd);
      if (r?.error) return setMsg({ ok: false, text: r.error });
      setLogo(URL.createObjectURL(f));
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ ok: true, text: r?.message ?? "Logo saved." });
    });

  const removeLogo = () =>
    start(async () => {
      setMsg(null);
      const r = await removeTemplateLogoAction(department, docType);
      if (r?.error) return setMsg({ ok: false, text: r.error });
      setLogo(null);
      setMsg({ ok: true, text: r?.message ?? "Logo removed." });
    });

  return (
    <div className="space-y-4" data-testid={`tpl-editor-${department}-${docType}`}>
      {!noticeOnly && (
        <div className={card} data-testid="tpl-preview">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How the top of a {copy.word.toLowerCase()} will look</p>
          <div className="mt-3 flex items-start justify-between gap-4 rounded-lg border border-dashed border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
            <div className="flex flex-col gap-2">
              {v.showLogo && shownLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownLogo} alt="" className="h-12 object-contain object-left" data-testid="tpl-preview-logo" />
              )}
              <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50" data-testid="tpl-preview-name">{shownName}</p>
            </div>
            <p className="text-xs font-bold tracking-wide text-slate-500" data-testid="tpl-preview-title">{(v.titleText.trim() || copy.defaultTitle).toUpperCase()}</p>
          </div>
          {v.noticeEnabled && v.noticeText.trim() && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="tpl-preview-notice">
              <span className="block text-[11px] font-bold uppercase tracking-wide">Please note</span>
              <span className="whitespace-pre-line">{v.noticeText}</span>
            </p>
          )}
        </div>
      )}

      {!noticeOnly && (
        <div className={`${card} space-y-4`}>
          <div>
            <label htmlFor={id("name")} className={lab}>Company name on this {copy.word.toLowerCase()}</label>
            <input id={id("name")} value={v.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={TEMPLATE_LIMITS.displayName} placeholder={copy.fallbackName} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-name" />
            <p className={help}>Leave it blank to use {copy.fallbackName}.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo for this template" className="h-full w-full object-contain" data-testid="tpl-own-logo" />
              ) : (
                <span className="px-2 text-center text-[10px] text-slate-500" data-testid="tpl-no-own-logo">{copy.fallbackLogo ? "Using the usual company logo" : "No logo"}</span>
              )}
            </div>
            <div className="space-y-2">
              <p className={lab}>Logo for this {copy.word.toLowerCase()}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, up to 2MB. Without one, the usual company logo is used.</p>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id("file")} className="sr-only">Choose a logo file</label>
                  <input id={id("file")} ref={fileRef} type="file" accept="image/png,image/jpeg" className="text-xs text-slate-600 dark:text-slate-400" data-testid="tpl-file" />
                  <button type="button" onClick={upload} disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900" data-testid="tpl-upload">{logo ? "Replace logo" : "Upload logo"}</button>
                  {logo && <button type="button" onClick={removeLogo} disabled={pending} className="text-xs text-red-700 hover:underline disabled:opacity-60 dark:text-red-300" data-testid="tpl-remove-logo">Remove logo</button>}
                </div>
              )}
            </div>
          </div>
          <label htmlFor={id("show")} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
            <input id={id("show")} type="checkbox" checked={v.showLogo} onChange={(e) => set("showLogo", e.target.checked)} disabled={!canEdit} data-testid="tpl-show-logo" />
            Show a logo on this {copy.word.toLowerCase()}
          </label>
          <div>
            <label htmlFor={id("title")} className={lab}>Title at the top right</label>
            <input id={id("title")} value={v.titleText} onChange={(e) => set("titleText", e.target.value)} maxLength={TEMPLATE_LIMITS.title} placeholder={copy.defaultTitle} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-title" />
          </div>
          <div>
            <label htmlFor={id("intro")} className={lab}>Opening wording (printed under the heading)</label>
            <textarea id={id("intro")} rows={2} value={v.introText} onChange={(e) => set("introText", e.target.value)} maxLength={TEMPLATE_LIMITS.intro} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-intro" />
          </div>
          <div>
            <label htmlFor={id("terms")} className={lab}>{copy.termsLabel}</label>
            <textarea id={id("terms")} rows={4} value={v.termsText} onChange={(e) => set("termsText", e.target.value)} maxLength={TEMPLATE_LIMITS.terms} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-terms" />
            <p className={help}>{copy.termsHelp}</p>
          </div>
          <div>
            <label htmlFor={id("footer")} className={lab}>Closing wording (printed at the end)</label>
            <textarea id={id("footer")} rows={2} value={v.footerText} onChange={(e) => set("footerText", e.target.value)} maxLength={TEMPLATE_LIMITS.footer} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-footer" />
          </div>
        </div>
      )}

      <div className={`${card} space-y-3`} data-testid="tpl-notice-box">
        <div>
          <p className={lab}>Standing notice</p>
          <p className={help}>One line that prints, in a highlighted box, on every {copy.word.toLowerCase()} you make or send while it is switched on. For example &ldquo;We are out of the office from June 3 to June 10. Orders are processed when we are back.&rdquo;</p>
        </div>
        <label htmlFor={id("notice-on")} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input id={id("notice-on")} type="checkbox" checked={v.noticeEnabled} onChange={(e) => set("noticeEnabled", e.target.checked)} disabled={!canEdit} data-testid="tpl-notice-on" />
          Show this notice
        </label>
        <div>
          <label htmlFor={id("notice")} className="text-xs font-medium text-slate-700 dark:text-slate-300">Notice</label>
          <textarea id={id("notice")} rows={3} value={v.noticeText} onChange={(e) => set("noticeText", e.target.value)} maxLength={TEMPLATE_LIMITS.notice} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-notice" />
        </div>
        <div className="max-w-xs">
          <label htmlFor={id("until")} className="text-xs font-medium text-slate-700 dark:text-slate-300">Stop showing it after (optional)</label>
          <input id={id("until")} type="date" value={v.noticeUntil} onChange={(e) => set("noticeUntil", e.target.value)} disabled={!canEdit} className={`${field} mt-1`} data-testid="tpl-notice-until" />
          <p className={help}>After this day it hides by itself. Leave it empty to keep it until you switch it off.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canEdit && <button type="button" onClick={save} disabled={pending} className={primary} data-testid="tpl-save">{pending ? "Saving…" : "Save"}</button>}
        <a href={`/api/templates/preview?department=${department}&type=${docType}`} target="_blank" rel="noreferrer" className={ghost} data-testid="tpl-preview-pdf">Preview a sample PDF</a>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} role={msg.ok ? "status" : "alert"} data-testid={msg.ok ? "tpl-message" : "tpl-error"}>{msg.text}</span>}
      </div>
      {canEdit && <p className="text-xs text-slate-500">The sample PDF uses what you last saved, with made-up names and numbers.</p>}
    </div>
  );
}
