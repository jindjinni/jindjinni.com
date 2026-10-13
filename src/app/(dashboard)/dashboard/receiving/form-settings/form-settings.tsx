"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReceivingFormConfig } from "@/app/actions/receiving-form";
import { HIDEABLE_FIELDS, HIDEABLE_PHOTOS, OPTIONAL_FIELDS, STANDARD_FORM, type ReceivingFormConfig } from "@/lib/receiving-form-config";
import { MAX_EXTRA_PER_SECTION, MAX_LABEL, PICK_SECTIONS, pickId, type PickSectionKey } from "@/lib/receiving-picks";

type Group = "hiddenPhotos" | "hiddenFields" | "optional";

export function FormSettings({ initial, picksOn }: { initial: ReceivingFormConfig; picksOn: boolean }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<ReceivingFormConfig>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Partial<Record<PickSectionKey, string>>>({});

  const pickShown = (section: PickSectionKey, label: string) => !cfg.hiddenPicks.includes(pickId(section, label));
  const togglePickShown = (section: PickSectionKey, label: string, on: boolean) => {
    const id = pickId(section, label);
    setCfg({ ...cfg, hiddenPicks: on ? cfg.hiddenPicks.filter((x) => x !== id) : [...new Set([...cfg.hiddenPicks, id])] });
  };
  const addOwn = (section: PickSectionKey) => {
    const label = (draft[section] ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
    if (!label) return;
    const have = [...PICK_SECTIONS.find((x) => x.key === section)!.options, ...(cfg.extraPicks[section] ?? [])].map((x) => x.toLowerCase());
    if (have.includes(label.toLowerCase()) || (cfg.extraPicks[section] ?? []).length >= MAX_EXTRA_PER_SECTION) return;
    setCfg({ ...cfg, extraPicks: { ...cfg.extraPicks, [section]: [...(cfg.extraPicks[section] ?? []), label] } });
    setDraft({ ...draft, [section]: "" });
  };
  const removeOwn = (section: PickSectionKey, label: string) => {
    const left = (cfg.extraPicks[section] ?? []).filter((x) => x !== label);
    const next = { ...cfg.extraPicks };
    if (left.length) next[section] = left;
    else delete next[section];
    setCfg({ ...cfg, extraPicks: next });
  };

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

      <section className={card} aria-label="Pick lists" data-testid="pick-settings">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Pick lists (tick instead of typing)</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Receivers tick what applies in each list instead of writing it out, and every list ends with a Custom note for anything the options do not cover. Untick an option your team never uses to take it off the list, or add your own.
          Options already ticked on a shipment stay on that shipment.
        </p>
        {!picksOn && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="picks-off-note">The pick lists are not switched on for your company yet. You can set them up now; receivers will see them once they are on.</p>}
        <div className="mt-3 space-y-2">
          {PICK_SECTIONS.map((sec) => {
            const own = cfg.extraPicks[sec.key] ?? [];
            const hiddenCount = sec.options.filter((o) => !pickShown(sec.key, o)).length;
            return (
              <details key={sec.key} className="rounded-lg border border-slate-200 dark:border-slate-700" data-testid={`ps-${sec.key}`}>
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-50">
                  {sec.title} <span className="ml-1 text-xs font-normal text-slate-500">{sec.options.length - hiddenCount + own.length} shown{hiddenCount ? `, ${hiddenCount} hidden` : ""}{own.length ? `, ${own.length} yours` : ""}</span>
                </summary>
                <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-700">
                  <p className="text-xs text-slate-500">{sec.help}</p>
                  <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {sec.options.map((o) => (
                      <li key={o}>
                        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                          <input type="checkbox" className={`${box} mt-0.5`} checked={pickShown(sec.key, o)} onChange={(e) => togglePickShown(sec.key, o, e.target.checked)} data-testid={`ps-${sec.key}-${pickId(sec.key, o).split(":")[1]}`} />
                          <span>{o}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {own.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {own.map((o) => (
                        <li key={o} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm dark:bg-slate-800/60">
                          <span>{o} <span className="text-[10px] uppercase tracking-wide text-slate-400">yours</span></span>
                          <button type="button" className="text-xs text-red-700 underline dark:text-red-300" onClick={() => removeOwn(sec.key, o)} data-testid={`ps-${sec.key}-remove`}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="sr-only" htmlFor={`ps-add-${sec.key}`}>Add your own option to {sec.title}</label>
                    <input
                      id={`ps-add-${sec.key}`}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                      placeholder="Add your own option"
                      maxLength={MAX_LABEL}
                      value={draft[sec.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [sec.key]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOwn(sec.key); } }}
                      data-testid={`ps-${sec.key}-new`}
                    />
                    <button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800" onClick={() => addOwn(sec.key)} data-testid={`ps-${sec.key}-add`}>Add</button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"}`} data-testid="fs-msg">{msg.text}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => save(cfg)} disabled={pending} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-60" data-testid="fs-save">{pending ? "Saving…" : "Save form settings"}</button>
        <button type="button" onClick={() => { setCfg(STANDARD_FORM); save(STANDARD_FORM); }} disabled={pending} className="rounded-md px-3 py-2 text-sm text-slate-600 underline dark:text-slate-300" data-testid="fs-reset">Put the standard form back</button>
      </div>
    </div>
  );
}
