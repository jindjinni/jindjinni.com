"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReceivingFormConfig } from "@/app/actions/receiving-form";
import { HIDEABLE_FIELDS, HIDEABLE_PHOTOS, OPTIONAL_FIELDS, STANDARD_FORM, type ReceivingFormConfig } from "@/lib/receiving-form-config";

type Group = "hiddenPhotos" | "hiddenFields" | "optional";

export function FormSettings({ initial }: { initial: ReceivingFormConfig }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<ReceivingFormConfig>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // The boxes say "Show" / "Ask for": ticked = the normal form, so hiding is un-ticking.
  const has = (g: Group, k: string) => (cfg[g] as string[]).includes(k);
  const toggle = (g: Group, k: string, on: boolean) => setCfg({ ...cfg, [g]: on ? (cfg[g] as string[]).filter((x) => x !== k) : [...(cfg[g] as string[]), k] } as ReceivingFormConfig);

  const save = (c: ReceivingFormConfig) =>
    start(async () => {
      setMsg(null);
      const r = await saveReceivingFormConfig(c);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  const box = "h-4 w-4 accent-amber-600";
  const card = "mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
  return (
    <div className="max-w-2xl" data-testid="form-settings">
      <section className={card} aria-label="Photo types">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Photos on the form</h2>
        <p className="mt-0.5 text-sm text-slate-500">Untick a photo type your team does not take. It will not be shown and will not be required to submit.</p>
        <ul className="mt-3 space-y-2">
          {HIDEABLE_PHOTOS.map((p) => (
            <li key={p.key}>
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                <input type="checkbox" className={box} checked={!has("hiddenPhotos", p.key)} onChange={(e) => toggle("hiddenPhotos", p.key, e.target.checked)} data-testid={`photo-${p.key}`} />
                {p.label}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className={card} aria-label="Questions to hide">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Questions on the form</h2>
        <p className="mt-0.5 text-sm text-slate-500">Untick a question your team never uses to take it off the form.</p>
        <ul className="mt-3 space-y-2">
          {HIDEABLE_FIELDS.map((f) => (
            <li key={f.key}>
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                <input type="checkbox" className={box} checked={!has("hiddenFields", f.key)} onChange={(e) => toggle("hiddenFields", f.key, e.target.checked)} data-testid={`field-${f.key}`} />
                {f.label}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className={card} aria-label="Required questions">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Required before submitting</h2>
        <p className="mt-0.5 text-sm text-slate-500">Untick a question to keep it on the form but let a shipment be submitted without an answer.</p>
        <ul className="mt-3 space-y-2">
          {OPTIONAL_FIELDS.map((f) => (
            <li key={f.key}>
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                <input type="checkbox" className={box} checked={!has("optional", f.key)} onChange={(e) => toggle("optional", f.key, e.target.checked)} data-testid={`required-${f.key}`} />
                {f.label} <span className="text-xs text-slate-400">{has("optional", f.key) ? "(not required)" : "(required)"}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"}`} data-testid="fs-msg">{msg.text}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => save(cfg)} disabled={pending} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-60" data-testid="fs-save">{pending ? "Saving…" : "Save form settings"}</button>
        <button type="button" onClick={() => { setCfg(STANDARD_FORM); save(STANDARD_FORM); }} disabled={pending} className="rounded-md px-3 py-2 text-sm text-slate-600 underline dark:text-slate-300" data-testid="fs-reset">Put the standard form back</button>
      </div>
    </div>
  );
}
