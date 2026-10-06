"use client";

// Step 6: check a received product's lot / serial number against the recalls, without leaving the shipment.
// Type it, scan the barcode with the camera, or take a photo of the label. Official lookup pages open in a new tab.

import { useState, useTransition } from "react";
import {
  importRecallList,
  previewRecallList,
  removeRecall,
  removeRecallCheck,
  saveRecall,
  setupRecalls,
  type RecallActionState,
} from "@/app/actions/receiving-recalls";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import { RECALL_RESULT_LABELS, isRecalledResult, normalizeNumber, recallsForProduct } from "@/lib/receiving-recall";
import type { ItemState } from "./item-card";
import { field } from "./intake-parts";
import { ScanTools } from "./scan-tools";
import { useRecallRunner } from "./use-recall-runner";

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const btnPrimary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";
const linkBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/50";

export function RecallCheck({
  packageId,
  items,
  editable,
  isAdminUser,
  photoReading,
  recalls,
  onRecalls,
  checks,
  onChecks,
  onPatchMany,
  onError,
  focus,
  onBack,
}: {
  /** Set by the form when a product that needs the checker was just chosen: this row is selected for the check. */
  focus?: { rowId: string; n: number } | null;
  /** Puts the receiver back on the Items tab. */
  onBack?: () => void;
  packageId: string;
  items: ItemState[];
  editable: boolean;
  isAdminUser: boolean;
  photoReading: boolean;
  recalls: RecallView[];
  onRecalls: (r: RecallView[]) => void;
  checks: RecallCheckView[];
  onChecks: (checks: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
}) {
  const rows = items.filter((i) => i.productName.trim());
  const [rowId, setRowId] = useState("");
  const [input, setInput] = useState("");
  const [lookedUp, setLookedUp] = useState<Record<string, boolean>>({});
  const [removing, startRemove] = useTransition();
  const runner = useRecallRunner({ packageId, recalls, onChecks, onPatchMany, onError });
  const { outcome, setOutcome, note: scanMsg, pending } = runner;

  // When the form switches the checker on for a row, select that row (adjusting state while rendering).
  const [seenFocus, setSeenFocus] = useState(focus?.n ?? 0);
  if (focus && focus.n !== seenFocus) {
    setSeenFocus(focus.n);
    setRowId(focus.rowId);
    setOutcome(null);
  }

  const row = rows.find((r) => r.id === rowId) ?? rows[0];
  const rowChecks = checks.filter((c) => c.itemId === row?.id);
  const matching = row ? recallsForProduct(row.productName, recalls) : [];
  const shown = recalls.filter((r) => r.active);

  function applyScanned(text: string) {
    if (!row) return;
    setInput(runner.applyScanned(row, text));
  }
  function confirm(recallId: string, affected: boolean) {
    if (row) runner.confirm(row, recallId, input, affected);
  }
  function removeCheck(id: string) {
    startRemove(async () => {
      const r = await removeRecallCheck(packageId, id);
      if (r.error) return onError(r.error);
      if (r.checks) onChecks(r.checks);
    });
  }

  const toneClass = {
    bad: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
    ok: "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-50",
    info: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50",
  } as const;

  return (
    <div className="mt-8" id="recall-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Recall check</h3>
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            &larr; Back to items received
          </button>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
        Some products are under recall (Omnipod 5 Pods, FreeStyle Libre 3 sensors, Dexcom G7 receivers). Check the lot or serial number before accepting. A product found on a recall list is marked for return.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Add a received product above, then check its lot or serial number here.</p>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <div>
              <label htmlFor="recall-row" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</label>
              <select
                id="recall-row"
                className={`${field} mt-1`}
                value={row?.id ?? ""}
                onChange={(e) => {
                  setRowId(e.target.value);
                  setOutcome(null);
                }}
              >
                {rows.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i + 1}. {r.productName}
                    {r.lotNumber ? ` (${r.lotNumber})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="recall-number" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lot or serial number</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  id="recall-number"
                  className={`${field} min-w-[12rem] flex-1 font-mono uppercase`}
                  value={input}
                  placeholder={row?.lotNumber ? `e.g. ${row.lotNumber}` : "Type, use a barcode scanner, or take a photo"}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={!editable}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (editable && !pending) applyScanned(input);
                    }
                  }}
                />
                <button type="button" className={btnPrimary} disabled={!editable || pending || !input.trim()} onClick={() => applyScanned(input)}>
                  {pending ? "Checking…" : "Check"}
                </button>
              </div>
              {row?.lotNumber && !input && editable && (
                <button type="button" className="mt-1.5 text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950 dark:text-sky-300" onClick={() => setInput(row.lotNumber)}>
                  Use this row&apos;s lot number ({row.lotNumber})
                </button>
              )}
            </div>
          </div>

          <div className="mt-3">
            <ScanTools idPrefix="recall" disabled={!editable || !row} photoReading={photoReading} onText={applyScanned} onError={onError} />
          </div>
          {scanMsg && <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">{scanMsg}</p>}

          {outcome && (
            <div role="status" className={`mt-4 rounded-lg border px-4 py-3 text-sm ${toneClass[outcome.tone]}`}>
              <p className="text-base font-bold">{outcome.title}</p>
              {outcome.lines.map((l) => (
                <p key={l} className="mt-1">{l}</p>
              ))}
            </div>
          )}

          {rowChecks.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800" aria-label="Checks made on this product">
              {rowChecks.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-xs">{c.enteredNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isRecalledResult(c.result) ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" : c.note.startsWith("NEAR:") ? "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{c.note.startsWith("NEAR:") ? "Looks like a recalled number" : RECALL_RESULT_LABELS[c.result]}</span>
                  {c.recallName && <span className="text-xs text-slate-500">{c.recallName}</span>}
                  {editable && (
                    <button type="button" aria-label={`Remove check ${c.enteredNumber}`} className="ml-auto rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-red-700 dark:hover:bg-slate-800" disabled={removing} onClick={() => removeCheck(c.id)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">Official recall lookups</h4>
        <p className="mt-0.5 text-xs text-slate-500">Open the manufacturer&apos;s own page to be sure, then record what it said for the number above.</p>
        {shown.length === 0 ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
            No recalls are set up yet. {isAdminUser ? "Use Manage recalls below to add the three starting recalls." : "Ask an admin to set them up."}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {shown.map((r) => {
              const mine = matching.some((m) => m.id === r.id);
              const loaded = r.numberCount + r.prefixCount;
              return (
                <div key={r.id} className={`flex flex-col rounded-xl border p-3.5 ${mine ? "border-sky-400 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{r.name}</p>
                    {mine && <span className="shrink-0 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">This product</span>}
                  </div>
                  {r.manufacturer && <p className="text-xs text-slate-500">{r.manufacturer}</p>}
                  {r.numberHint && <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{r.numberHint}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    {loaded > 0 ? `${loaded.toLocaleString()} numbers loaded${r.listUpdatedAt ? `, updated ${r.listUpdatedAt}` : ""}.` : "No list loaded: matching is done on the manufacturer's page."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.lookupUrl && (
                      <a className={linkBtn} href={r.lookupUrl} target="_blank" rel="noopener noreferrer" onClick={() => setLookedUp((s) => ({ ...s, [r.id]: true }))}>
                        {r.lookupLabel || "Open lookup"} <span aria-hidden>↗</span>
                      </a>
                    )}
                    {r.noticeUrl && (
                      <a className="inline-flex items-center gap-1 px-1 py-2 text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 hover:text-sky-950 dark:text-sky-300" href={r.noticeUrl} target="_blank" rel="noopener noreferrer">
                        Recall notice <span aria-hidden>↗</span>
                      </a>
                    )}
                  </div>
                  {editable && row && (lookedUp[r.id] || mine) && (
                    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">What did their page say for {input.trim() ? normalizeNumber(input) : "the number"}?</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={pending} onClick={() => confirm(r.id, true)}>
                          Affected
                        </button>
                        <button type="button" className={btn} disabled={pending} onClick={() => confirm(r.id, false)}>
                          Not affected
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdminUser && <ManageRecalls recalls={recalls} onRecalls={onRecalls} onError={onError} />}
    </div>
  );
}

// ---- admin: the recalls and the lists they match against --------------------------

function ManageRecalls({ recalls, onRecalls, onError }: { recalls: RecallView[]; onRecalls: (r: RecallView[]) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();

  function done(r: RecallActionState) {
    if (r.error) return onError(r.error);
    if (r.recalls) onRecalls(r.recalls);
    setNotice(r.notice ?? "");
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold text-slate-900 hover:bg-slate-50 dark:text-slate-50 dark:hover:bg-slate-800/60">
        <span>Manage recalls (admin)</span>
        <span aria-hidden className="text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <p className="max-w-3xl text-xs text-slate-600 dark:text-slate-300">
            Paste the official lot or serial list for each recall (from the manufacturer or the FDA page) and the app matches scans and typed numbers against it automatically. Without a list, the agent uses the manufacturer&apos;s page and records the answer. Add * after the start of a lot to cover every lot that begins that way (PH1U01*).
          </p>
          {notice && <p role="status" className="mt-2 rounded bg-green-50 px-3 py-1.5 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-100">{notice}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={pending} onClick={() => start(async () => done(await setupRecalls()))}>
              Add the starting recalls
            </button>
            <NewRecall pending={pending} onSave={(input) => start(async () => done(await saveRecall(null, input)))} />
          </div>
          <div className="mt-4 space-y-4">
            {recalls.map((r) => (
              <RecallEditor key={`${r.id}:${r.listUpdatedAt}:${r.name}`} recall={r} onDone={done} onError={onError} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY = { name: "", manufacturer: "", keywords: "", numberHint: "", lookupUrl: "", lookupLabel: "", noticeUrl: "" };

function NewRecall({ onSave, pending }: { onSave: (i: typeof EMPTY) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  if (!open)
    return (
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        Add another recall
      </button>
    );
  return (
    <div className="w-full rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <RecallFields v={v} onChange={setV} idPrefix="new-recall" />
      <div className="mt-3 flex gap-2">
        <button type="button" className={btnPrimary} disabled={pending || !v.name.trim()} onClick={() => { onSave(v); setV(EMPTY); setOpen(false); }}>
          Save recall
        </button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RecallFields({ v, onChange, idPrefix }: { v: typeof EMPTY; onChange: (v: typeof EMPTY) => void; idPrefix: string }) {
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...v, [k]: e.target.value });
  const lab = "text-xs font-semibold text-slate-600 dark:text-slate-300";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className={lab} htmlFor={`${idPrefix}-name`}>Recall name</label><input id={`${idPrefix}-name`} className={`${field} mt-1`} value={v.name} onChange={set("name")} maxLength={120} /></div>
      <div><label className={lab} htmlFor={`${idPrefix}-mf`}>Manufacturer</label><input id={`${idPrefix}-mf`} className={`${field} mt-1`} value={v.manufacturer} onChange={set("manufacturer")} maxLength={80} /></div>
      <div><label className={lab} htmlFor={`${idPrefix}-kw`}>Words in the product name (comma-separated)</label><input id={`${idPrefix}-kw`} className={`${field} mt-1`} value={v.keywords} onChange={set("keywords")} maxLength={200} /></div>
      <div><label className={lab} htmlFor={`${idPrefix}-hint`}>Where to find the number</label><input id={`${idPrefix}-hint`} className={`${field} mt-1`} value={v.numberHint} onChange={set("numberHint")} maxLength={400} /></div>
      <div><label className={lab} htmlFor={`${idPrefix}-lk`}>Lookup page link</label><input id={`${idPrefix}-lk`} className={`${field} mt-1`} value={v.lookupUrl} onChange={set("lookupUrl")} placeholder="https://" maxLength={500} /></div>
      <div><label className={lab} htmlFor={`${idPrefix}-ll`}>Lookup button text</label><input id={`${idPrefix}-ll`} className={`${field} mt-1`} value={v.lookupLabel} onChange={set("lookupLabel")} maxLength={80} /></div>
      <div className="sm:col-span-2"><label className={lab} htmlFor={`${idPrefix}-nl`}>Recall notice link</label><input id={`${idPrefix}-nl`} className={`${field} mt-1`} value={v.noticeUrl} onChange={set("noticeUrl")} placeholder="https://" maxLength={500} /></div>
    </div>
  );
}

function RecallEditor({ recall, onDone, onError }: { recall: RecallView; onDone: (r: RecallActionState) => void; onError: (m: string) => void }) {
  const [v, setV] = useState({
    name: recall.name,
    manufacturer: recall.manufacturer,
    keywords: recall.keywords,
    numberHint: recall.numberHint,
    lookupUrl: recall.lookupUrl,
    lookupLabel: recall.lookupLabel,
    noticeUrl: recall.noticeUrl,
  });
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [preview, setPreview] = useState<RecallActionState["preview"] | null>(null);
  const [pending, start] = useTransition();
  const loaded = recall.numberCount + recall.prefixCount;
  return (
    <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-label={recall.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">{recall.name}</p>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={recall.active} disabled={pending} onChange={(e) => start(async () => onDone(await saveRecall(recall.id, { ...v, active: e.target.checked })))} />
          Show to receivers
        </label>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-sky-800 dark:text-sky-300">Edit details and links</summary>
        <div className="mt-3">
          <RecallFields v={v} onChange={setV} idPrefix={`rc-${recall.id}`} />
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} disabled={pending || !v.name.trim()} onClick={() => start(async () => onDone(await saveRecall(recall.id, { ...v, active: recall.active })))}>
              Save details
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Remove "${recall.name}" and its ${loaded.toLocaleString()} loaded numbers? Past checks keep their record.`)) start(async () => onDone(await removeRecall(recall.id)));
              }}
            >
              Remove recall
            </button>
          </div>
        </div>
      </details>
      <div className="mt-3">
        <label htmlFor={`paste-${recall.id}`} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Paste the official lot / serial list ({loaded > 0 ? `${loaded.toLocaleString()} loaded${recall.listUpdatedAt ? `, updated ${recall.listUpdatedAt}` : ""}` : "none loaded yet"})
        </label>
        <textarea
          id={`paste-${recall.id}`}
          rows={4}
          className={`${field} mt-1 font-mono text-xs`}
          value={paste}
          placeholder="One per line, or separated by commas or spaces"
          onChange={(e) => {
            setPaste(e.target.value);
            setPreview(null);
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="How to load the list" className={`${field} w-auto`} value={mode} onChange={(e) => { setMode(e.target.value as "add" | "replace"); setPreview(null); }}>
            <option value="add">Add to the current list</option>
            <option value="replace">Replace the current list</option>
          </select>
          <button
            type="button"
            className={btn}
            disabled={pending || !paste.trim()}
            onClick={() =>
              start(async () => {
                const r = await previewRecallList(recall.id, paste, mode);
                if (r.error) return onError(r.error);
                setPreview(r.preview ?? null);
              })
            }
          >
            Preview
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={pending || !preview || preview.values + preview.prefixes === 0}
            onClick={() =>
              start(async () => {
                const r = await importRecallList(recall.id, paste, mode);
                onDone(r);
                if (!r.error) {
                  setPaste("");
                  setPreview(null);
                }
              })
            }
          >
            {mode === "replace" ? "Replace list" : "Add to list"}
          </button>
        </div>
        {preview && (
          <p role="status" className="mt-2 text-xs text-slate-700 dark:text-slate-200">
            Found {preview.values.toLocaleString()} numbers{preview.prefixes ? ` and ${preview.prefixes} prefixes` : ""} ({preview.newOnes.toLocaleString()} new). {preview.skipped ? `${preview.skipped} words, dates or short numbers will be skipped. ` : ""}
            {preview.sample.length ? `For example: ${preview.sample.join(", ")}.` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
