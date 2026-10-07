"use client";

import { useActionState, useState } from "react";
import { deleteEntryAction, draftFromFeedbackAction, saveEntryAction, setFeedbackStatusAction, type LibState } from "@/app/actions/jin-library";
import { CATEGORY_LABELS, type KnowledgeCategory } from "@/lib/industry-knowledge-builtin";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const label = "text-xs font-medium text-slate-600 dark:text-slate-400";
const primaryBtn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const quietBtn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const dangerBtn = "text-sm font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400";

function Msg({ s }: { s: LibState }) {
  if (!s) return null;
  return (
    <>
      {s.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{s.error}</p>}
      {s.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{s.message}</p>}
    </>
  );
}

export type EntryValues = { id?: string; title: string; category: string; brand: string; body: string; source: string; verifiedOn: string; formats: string; formatKind: string; status: "DRAFT" | "LIVE" };
export const emptyEntry: EntryValues = { title: "", category: "lot_serial", brand: "", body: "", source: "", verifiedOn: "", formats: "", formatKind: "lot", status: "DRAFT" };

/** Add or edit one library entry. */
export function EntryForm({ v, idPrefix }: { v: EntryValues; idPrefix: string }) {
  // Controlled fields, because a form action clears ordinary fields when it finishes, even after an error message.
  const [vals, setVals] = useState<EntryValues>(v);
  const [state, save, saving] = useActionState(async (prev: LibState, fd: FormData) => {
    const r = await saveEntryAction(prev, fd);
    if (!v.id && r?.message) setVals(emptyEntry);
    return r;
  }, undefined);
  const f = (n: string) => `${idPrefix}-${n}`;
  const bind = (k: keyof EntryValues) => ({ value: (vals[k] as string) ?? "", onChange: (e: { target: { value: string } }) => setVals((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form action={save} className="flex flex-col gap-3" data-testid={`entry-form-${idPrefix}`}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className={label} htmlFor={f("title")}>Title</label>
          <input id={f("title")} name="title" {...bind("title")} maxLength={120} required className={input} placeholder="Example: Acme glucose strips, lot number layout" />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor={f("category")}>Category</label>
          <select id={f("category")} name="category" {...bind("category")} className={input}>
            {(Object.keys(CATEGORY_LABELS) as KnowledgeCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor={f("brand")}>Brand (leave empty for general facts)</label>
          <input id={f("brand")} name="brand" {...bind("brand")} maxLength={60} className={input} placeholder="Example: Dexcom" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={label} htmlFor={f("body")}>What Jin should know</label>
        <textarea id={f("body")} name="body" {...bind("body")} rows={5} maxLength={4000} required className={input} placeholder="Plain words. Facts only, nothing about a specific customer, company or price." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor={f("source")}>Where this comes from</label>
          <input id={f("source")} name="source" {...bind("source")} maxLength={300} className={input} placeholder="Maker's page, FDA record, your own experience…" />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor={f("verifiedOn")}>Last checked on</label>
          <input id={f("verifiedOn")} name="verifiedOn" type="date" {...bind("verifiedOn")} className={input} />
        </div>
      </div>
      <details className="rounded-md border border-slate-200 p-3 dark:border-slate-800" open={!!v.formats}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Lot or serial layouts (optional)</summary>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Lets Jin check a number against this brand. Write each layout with <strong>9</strong> for a digit, <strong>A</strong> for a letter and <strong>X</strong> for a letter or digit; keep any dash or slash as it is printed. One layout per line. Example: <code>AA99999</code>.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className={label} htmlFor={f("formats")}>Layouts</label>
            <textarea id={f("formats")} name="formats" {...bind("formats")} rows={3} maxLength={800} className={`${input} font-mono`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label} htmlFor={f("formatKind")}>These are for</label>
            <select id={f("formatKind")} name="formatKind" {...bind("formatKind")} className={input}>
              <option value="lot">Lot numbers</option>
              <option value="serial">Serial numbers</option>
            </select>
          </div>
        </div>
      </details>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor={f("status")}>Status</label>
          <select id={f("status")} name="status" {...bind("status")} className={input}>
            <option value="DRAFT">Draft (Jin can&apos;t see it)</option>
            <option value="LIVE">Live (Jin uses it)</option>
          </select>
        </div>
        <button className={primaryBtn} disabled={saving} data-testid={`entry-save-${idPrefix}`}>{saving ? "Saving…" : v.id ? "Save changes" : "Add entry"}</button>
      </div>
      <Msg s={state} />
      <p className="text-xs text-slate-500 dark:text-slate-400">Going live needs a source and a last-checked day. Never put a customer&apos;s name, a company&apos;s records or prices in the library: every company&apos;s Jin reads it.</p>
    </form>
  );
}

export function DeleteEntry({ id }: { id: string }) {
  const [state, del, busy] = useActionState(deleteEntryAction, undefined);
  return (
    <form action={del} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button className={dangerBtn} disabled={busy} data-testid="entry-delete">Delete this entry</button>
      <Msg s={state} />
    </form>
  );
}

export function FeedbackButtons({ id }: { id: string }) {
  const [s1, review, b1] = useActionState(setFeedbackStatusAction, undefined);
  const [s2, draft, b2] = useActionState(draftFromFeedbackAction, undefined);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={draft}>
        <input type="hidden" name="id" value={id} />
        <button className={quietBtn} disabled={b2} data-testid="fb-draft">Turn into a draft entry</button>
      </form>
      <form action={review}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="REVIEWED" />
        <button className={quietBtn} disabled={b1} data-testid="fb-reviewed">Mark reviewed</button>
      </form>
      <form action={review}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value="DISMISSED" />
        <button className={quietBtn} disabled={b1} data-testid="fb-dismiss">Dismiss</button>
      </form>
      <Msg s={s1} />
      <Msg s={s2} />
    </div>
  );
}
