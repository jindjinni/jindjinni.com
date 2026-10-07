"use client";

// Step 6, "Lot & serial numbers" tab. For each product that arrived the receiving agent records every lot number and
// every serial number, one at a time and separated by commas, in either of two ways:
//   - typing or pasting them (a handheld scanner can also fill the box), or
//   - taking clear group photos: the photo is read inside the browser (barcodes plus printed text, nothing uploaded) and
//     the numbers it finds are put in the boxes as CANDIDATES.
// The agent compares the boxes with the photo and fixes anything misread, ticks "I checked them", and saves. Every
// saved number is then checked on the server for repeats, made-up serials and the recall lists, exactly like a single
// scan. A photo reader can misread a character, so nothing from a photo is saved without that confirmation.

import { useEffect, useMemo, useRef, useState } from "react";
import { saveNumberBatch, type NumberOutcome } from "@/app/actions/receiving-numbers";
import { removeScannedUnit } from "@/app/actions/receiving-scan";
import type { RecallCheckView } from "@/lib/receiving-recall-service";
import { normalizeNumber } from "@/lib/receiving-recall";
import { BATCH_CHUNK, buildEntries, extractCandidates, joinNumberList, mergeNumberLists, splitNumberList, type NumberEntry } from "@/lib/receiving-number-list";
import { FLAG_LABELS, brandFor, productKind, severityOf } from "@/lib/receiving-serial-rules";
import type { SerialView } from "@/lib/receiving-serial-service";
import { CameraCapture, useCameraSupported } from "./camera-capture";
import type { ItemState } from "./item-card";
import { field } from "./intake-parts";
import { MIN_GOOD_SIDE, readGroupPhoto, type ReadProgress } from "./photo-reader";

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const btnPrimary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";

const CHIP = {
  stop: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  ok: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
} as const;

const STATUS_LABEL: Record<NumberOutcome["status"], string> = {
  OK: "Saved, OK",
  WARN: "Saved, check it",
  STOP: "Saved, STOP",
  RECALLED: "RECALLED",
  NEAR: "Looks like a recalled number",
  ALREADY: "Already recorded",
  SKIPPED: "Not saved",
};
const STATUS_TONE: Record<NumberOutcome["status"], keyof typeof CHIP> = { OK: "ok", WARN: "warn", STOP: "stop", RECALLED: "stop", NEAR: "stop", ALREADY: "warn", SKIPPED: "warn" };

type PhotoNote = { id: number; name: string; url: string; width: number; height: number; warnings: string[]; lots: number; serials: number; unsure: number; barcodes: number };

/** Lots and serials recorded on one product, each listed once. */
export function numbersFor(serials: SerialView[], itemId: string) {
  const mine = serials.filter((s) => s.itemId === itemId);
  const lots: string[] = [];
  const seen = new Set<string>();
  for (const s of mine) {
    const key = normalizeNumber(s.lot);
    if (s.lot && key && !seen.has(key)) {
      seen.add(key);
      lots.push(s.lot);
    }
  }
  return { rows: mine, lots, serials: mine.filter((s) => s.serial).map((s) => s.serial) };
}

export function NumbersTab({
  packageId,
  items,
  editable,
  serials,
  onSerials,
  onChecks,
  onPatchMany,
  onError,
  selectedId,
  onSelect,
}: {
  packageId: string;
  items: ItemState[];
  editable: boolean;
  serials: SerialView[];
  onSerials: (s: SerialView[]) => void;
  onChecks: (c: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const rows = items.filter((i) => i.productName.trim());
  const row = rows.find((r) => r.id === selectedId) ?? rows[0];
  const canCam = useCameraSupported();

  const [lotsText, setLotsText] = useState("");
  const [serialsText, setSerialsText] = useState("");
  const [unsure, setUnsure] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoNote[]>([]);
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [liveShot, setLiveShot] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<{ product: string; outcomes: NumberOutcome[]; unverified: string[] } | null>(null);
  const [copied, setCopied] = useState("");
  const pairs = useRef<Record<string, string>>({});
  const expiries = useRef<Record<string, string>>({});
  const fromPhoto = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const photoInput = useRef<HTMLInputElement | null>(null);
  const phoneInput = useRef<HTMLInputElement | null>(null);
  const photoId = useRef(0);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const u = urls.current;
    return () => {
      u.forEach((x) => URL.revokeObjectURL(x));
      abort.current?.abort();
    };
  }, []);

  const lots = useMemo(() => splitNumberList(lotsText), [lotsText]);
  const sers = useMemo(() => splitNumberList(serialsText), [serialsText]);
  const unsaved = lots.length + sers.length > 0 || photos.length > 0;
  const reading = progress !== null;
  const mine = row ? numbersFor(serials, row.id) : { rows: [], lots: [], serials: [] };
  const received = row ? Number(row.quantityReceived) : NaN;
  const needSerials = row ? productKind(row.productName) === "SERIALIZED" : false;

  function addPhoto(file: File) {
    if (!row) return onError("Add the received product in the table above first.");
    fromPhoto.current = true;
    setConfirmed(false);
    queue.current = queue.current.then(async () => {
      const ctl = new AbortController();
      abort.current = ctl;
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      try {
        setProgress({ step: "Opening the photo…", pct: 1 });
        const r = await readGroupPhoto(file, setProgress, ctl.signal);
        const c = extractCandidates({ barcodes: r.barcodes, text: r.text });
        setLotsText((t) => mergeNumberLists(t, c.lots));
        setSerialsText((t) => mergeNumberLists(t, c.serials));
        setUnsure((u) => {
          const have = new Set([...u.map(normalizeNumber), ...c.lots.map(normalizeNumber), ...c.serials.map(normalizeNumber)]);
          return [...u, ...c.unsure.filter((x) => !have.has(normalizeNumber(x)))];
        });
        Object.assign(pairs.current, c.pairs);
        Object.assign(expiries.current, c.expiries);
        const warnings = [...r.warnings];
        if (c.lots.length + c.serials.length === 0) warnings.push("No lot or serial numbers were found in this photo. Retake it closer and sharper, or type the numbers.");
        setPhotos((p) => [...p, { id: ++photoId.current, name: file.name, url, width: r.width, height: r.height, warnings, lots: c.lots.length, serials: c.serials.length, unsure: c.unsure.length, barcodes: r.barcodes.length }]);
      } catch (e) {
        URL.revokeObjectURL(url);
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          onError("Couldn't read that photo here. Check the connection and try again, or type the numbers.");
        }
      } finally {
        setProgress(null);
      }
    });
  }

  function cancelReading() {
    abort.current?.abort();
  }

  function assignUnsure(value: string, as: "lot" | "serial" | "drop") {
    setUnsure((u) => u.filter((x) => x !== value));
    if (as === "lot") setLotsText((t) => mergeNumberLists(t, [value]));
    if (as === "serial") setSerialsText((t) => mergeNumberLists(t, [value]));
  }

  function clearAll() {
    setLotsText("");
    setSerialsText("");
    setUnsure([]);
    setPhotos([]);
    setConfirmed(false);
    pairs.current = {};
    expiries.current = {};
    fromPhoto.current = false;
    urls.current.forEach((x) => URL.revokeObjectURL(x));
    urls.current = [];
  }

  async function save() {
    if (!row || !editable) return;
    const entries: NumberEntry[] = buildEntries(lots, sers, pairs.current, expiries.current);
    if (entries.length === 0) return onError("Type or photograph at least one lot or serial number first.");
    if (fromPhoto.current && !confirmed) return onError("Tick the box to confirm you compared the numbers with the photo.");
    const source = fromPhoto.current ? "PHOTO" : "TYPED";
    const all: NumberOutcome[] = [];
    const unverified = new Set<string>();
    let done = 0;
    setSaving({ done: 0, total: entries.length });
    try {
      for (let i = 0; i < entries.length; i += BATCH_CHUNK) {
        const chunk = entries.slice(i, i + BATCH_CHUNK);
        const r = await saveNumberBatch(packageId, row.id, chunk, source);
        if (r.error || !r.outcomes) {
          onError(r.error ?? "That didn't save. Check the connection and press Save again; numbers already saved are not repeated.");
          break;
        }
        all.push(...r.outcomes);
        r.unverified?.forEach((u) => unverified.add(u));
        if (r.serials) onSerials(r.serials);
        if (r.checks) onChecks(r.checks);
        if (r.itemPatches) {
          const updates: Record<string, Partial<ItemState>> = {};
          for (const [id, p] of Object.entries(r.itemPatches)) updates[id] = p;
          onPatchMany(updates);
        }
        done = i + chunk.length;
        setSaving({ done, total: entries.length });
      }
    } catch {
      onError("That didn't save. Check the connection and press Save again; numbers already saved are not repeated.");
    }
    setSaving(null);
    if (all.length > 0) setResults({ product: row.productName, outcomes: all, unverified: [...unverified] });
    if (done >= entries.length) {
      clearAll();
    } else {
      // keep only what was not saved, so a second press carries on from there
      const left = entries.slice(done);
      setLotsText(joinNumberList(left.filter((e) => !e.serial && e.lot).map((e) => e.lot!)));
      setSerialsText(joinNumberList(left.filter((e) => e.serial).map((e) => e.serial!)));
    }
  }

  async function remove(id: string) {
    const r = await removeScannedUnit(packageId, id);
    if (r.error) return onError(r.error);
    if (r.serials) onSerials(r.serials);
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      onError("Couldn't copy. Select the numbers and copy them by hand.");
    }
  }

  const stops = results?.outcomes.filter((o) => ["STOP", "RECALLED", "NEAR"].includes(o.status)) ?? [];

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" id="numbers-tab">
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Lot &amp; serial numbers</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
        Record every lot number and serial number that arrived, one at a time, separated by commas. Type or paste them, or take clear group photos and the numbers are read from the photo. Every number is then checked for repeats, made-up serials and recalls.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Add a received product under Items received first, then record its lot and serial numbers here.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div>
              <label htmlFor="num-row" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recording numbers for</label>
              <select id="num-row" className={`${field} mt-1`} value={row?.id ?? ""} disabled={unsaved || saving !== null} onChange={(e) => onSelect(e.target.value)}>
                {rows.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i + 1}. {r.productName}
                  </option>
                ))}
              </select>
              {unsaved && <p className="mt-1 text-xs text-slate-500">Save or clear the numbers below before switching product.</p>}
              {row && (
                <p className="mt-2 text-xs text-slate-500">
                  {brandFor(row.productName) ?? "Brand not recognised"}
                  {" · "}
                  {needSerials ? "each unit has its own serial number" : productKind(row.productName) === "LOT_ONLY" ? "normally lot number only (no serial)" : "serial or lot"}
                  {Number.isFinite(received) && received > 0 ? ` · ${received} received` : ""}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
              <p className="font-semibold">For a group photo the reader can trust</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Use the camera&apos;s 4K setting or higher (3840 × 2160). Phone cameras already do; the phone&apos;s own camera button below gives the sharpest picture.</li>
                <li>One product type per photo, laid flat in a single layer, labels facing up, good light, no glare, every number fully in the picture.</li>
                <li>Keep pharmacy stickers and anything with a patient&apos;s name out of the picture.</li>
                <li>Photos are read on this device and are not uploaded. The reader can still mistake a character (8 for B, 0 for O), so you check every number before saving.</li>
              </ul>
            </div>
          </div>

          {editable && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn} disabled={reading || saving !== null} onClick={() => phoneInput.current?.click()}>
                  <span aria-hidden>◉</span> Take a photo with the phone camera
                </button>
                {canCam && (
                  <button type="button" className={btn} disabled={reading || saving !== null} onClick={() => setLiveShot(true)}>
                    <span aria-hidden>▣</span> Take a photo with this computer&apos;s camera
                  </button>
                )}
                <button type="button" className={btn} disabled={reading || saving !== null} onClick={() => photoInput.current?.click()}>
                  <span aria-hidden>▤</span> Choose photos
                </button>
                <input
                  ref={phoneInput}
                  id="num-phone-photo"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Take a group photo with the phone camera"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) addPhoto(f);
                  }}
                />
                <input
                  ref={photoInput}
                  id="num-photo"
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choose group photos"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    for (const f of fs.slice(0, 12)) addPhoto(f);
                  }}
                />
              </div>
              {progress && (
                <div role="status" className="mt-3 max-w-xl">
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                    <span>{progress.step}</span>
                    <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800" onClick={cancelReading}>
                      Cancel
                    </button>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-sky-600 transition-all" style={{ width: `${Math.max(3, progress.pct)}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {photos.length > 0 && (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id} className="flex gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Group photo ${p.name}`} className="h-20 w-28 rounded object-cover" />
                  </a>
                  <div className="min-w-0 text-xs text-slate-700 dark:text-slate-200">
                    <p className="font-semibold tabular-nums">
                      {p.width} × {p.height}
                      {Math.max(p.width, p.height) >= MIN_GOOD_SIDE ? " (good size)" : " (small)"}
                    </p>
                    <p>
                      {p.lots} lot{p.lots === 1 ? "" : "s"}, {p.serials} serial{p.serials === 1 ? "" : "s"}
                      {p.unsure > 0 ? `, ${p.unsure} unsure` : ""}
                      {p.barcodes > 0 ? `, ${p.barcodes} barcode${p.barcodes === 1 ? "" : "s"}` : ""}
                    </p>
                    {p.warnings.map((w) => (
                      <p key={w} className="mt-1 text-amber-800 dark:text-amber-200">{w}</p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="num-lots" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lot numbers (separate with commas)</label>
                <span className="text-xs tabular-nums text-slate-500">{lots.length} lot{lots.length === 1 ? "" : "s"}</span>
              </div>
              <textarea
                id="num-lots"
                className={`${field} mt-1 min-h-28 font-mono text-sm`}
                value={lotsText}
                disabled={!editable || saving !== null}
                placeholder="PH1U01032521, PH1U01032522"
                spellCheck={false}
                autoCapitalize="characters"
                onChange={(e) => {
                  setLotsText(e.target.value);
                  setConfirmed(false);
                }}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="num-serials" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serial numbers (separate with commas)</label>
                <span className="text-xs tabular-nums text-slate-500">
                  {sers.length} serial{sers.length === 1 ? "" : "s"}
                  {Number.isFinite(received) && received > 0 && needSerials ? ` of ${received} received` : ""}
                </span>
              </div>
              <textarea
                id="num-serials"
                className={`${field} mt-1 min-h-28 font-mono text-sm`}
                value={serialsText}
                disabled={!editable || saving !== null}
                placeholder="1234567890, 1234567891"
                spellCheck={false}
                autoCapitalize="characters"
                onChange={(e) => {
                  setSerialsText(e.target.value);
                  setConfirmed(false);
                }}
              />
            </div>
          </div>

          {unsure.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-50">
              <p className="font-semibold">Numbers the reader found without a LOT or SN label. Say what each one is.</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {unsure.map((u) => (
                  <li key={u} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 dark:border-amber-700 dark:bg-slate-900">
                    <span className="font-mono text-xs">{u}</span>
                    <button type="button" className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900" aria-label={`${u} is a lot number`} onClick={() => assignUnsure(u, "lot")}>Lot</button>
                    <button type="button" className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900" aria-label={`${u} is a serial number`} onClick={() => assignUnsure(u, "serial")}>Serial</button>
                    <button type="button" className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={`Ignore ${u}`} onClick={() => assignUnsure(u, "drop")}>Ignore</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editable && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {photos.length > 0 && (
                <label className="flex max-w-xl items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                  <input id="num-confirm" type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>I compared every number above with the photo and fixed any the reader got wrong.</span>
                </label>
              )}
              <button type="button" className={btnPrimary} disabled={saving !== null || reading || lots.length + sers.length === 0 || (photos.length > 0 && !confirmed)} onClick={() => void save()}>
                {saving ? `Checking ${saving.done} of ${saving.total}…` : `Check and save ${lots.length + sers.length} number${lots.length + sers.length === 1 ? "" : "s"}`}
              </button>
              {unsaved && (
                <button type="button" className={btn} disabled={saving !== null} onClick={clearAll}>
                  Clear
                </button>
              )}
            </div>
          )}
          {needSerials && Number.isFinite(received) && received > 0 && sers.length + mine.serials.length < received && sers.length > 0 && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              {sers.length + mine.serials.length} serial number{sers.length + mine.serials.length === 1 ? "" : "s"} for {received} received. Each unit has its own serial, so some are still missing.
            </p>
          )}

          {results && (
            <div role="status" aria-live="polite" className={`mt-4 rounded-xl border-2 px-4 py-3 text-sm ${stops.length ? "border-red-400 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950/40 dark:text-red-50" : "border-green-400 bg-green-50 text-green-950 dark:border-green-700 dark:bg-green-950/30 dark:text-green-50"}`}>
              <p className="text-base font-bold">
                {stops.length
                  ? `${stops.length} number${stops.length === 1 ? "" : "s"} need${stops.length === 1 ? "s" : ""} a manager: ${results.product}`
                  : `Saved: ${results.product}`}
              </p>
              <p className="mt-1">
                {results.outcomes.filter((o) => o.status !== "SKIPPED" && o.status !== "ALREADY").length} saved and checked
                {results.outcomes.some((o) => o.status === "ALREADY") ? `, ${results.outcomes.filter((o) => o.status === "ALREADY").length} already recorded` : ""}
                {results.outcomes.some((o) => o.status === "SKIPPED") ? `, ${results.outcomes.filter((o) => o.status === "SKIPPED").length} not saved` : ""}.
              </p>
              {results.unverified.length > 0 && (
                <p className="mt-1 font-semibold">
                  Recall status NOT confirmed for {results.unverified.join(", ")}: no recall list is loaded, so look the numbers up on the manufacturer&apos;s page (Recall check tab) before you submit.
                </p>
              )}
              <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                {results.outcomes
                  .filter((o) => o.status !== "OK")
                  .map((o, i) => (
                    <li key={`${o.label}:${i}`} className="flex flex-wrap items-start gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[STATUS_TONE[o.status]]}`}>{STATUS_LABEL[o.status]}</span>
                      <span className="font-mono text-xs">{o.label}</span>
                      <span className="text-xs">{o.notes.join(" ")}</span>
                    </li>
                  ))}
              </ul>
              {stops.length > 0 && <p className="mt-2 font-semibold">Set those units aside. The product row is marked Pending review or Needs To Be Returned.</p>}
              {stops.length === 0 && <p className="mt-2 text-xs">OK does not prove a serial is real. Manufacturers do not publish serial lists, so this catches repeats, made-up numbers and recalls.</p>}
            </div>
          )}

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                Recorded for {row?.productName} <span className="font-normal text-slate-500">({mine.lots.length} lot{mine.lots.length === 1 ? "" : "s"}, {mine.serials.length} serial{mine.serials.length === 1 ? "" : "s"})</span>
              </h4>
              <div className="flex gap-2">
                <button type="button" className={btn} disabled={mine.lots.length === 0} onClick={() => void copy("lots", joinNumberList(mine.lots))}>
                  {copied === "lots" ? "Copied" : "Copy lots"}
                </button>
                <button type="button" className={btn} disabled={mine.serials.length === 0} onClick={() => void copy("serials", joinNumberList(mine.serials))}>
                  {copied === "serials" ? "Copied" : "Copy serials"}
                </button>
              </div>
            </div>
            {mine.rows.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">Nothing recorded for this product yet.</p>
            ) : (
              <>
                <dl className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                    <dt className="font-semibold uppercase tracking-wide text-slate-500">Lot numbers</dt>
                    <dd className="mt-1 break-words font-mono" data-testid="recorded-lots">{joinNumberList(mine.lots) || "—"}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                    <dt className="font-semibold uppercase tracking-wide text-slate-500">Serial numbers</dt>
                    <dd className="mt-1 break-words font-mono" data-testid="recorded-serials">{joinNumberList(mine.serials) || "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full min-w-[30rem] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold">Serial</th>
                        <th className="px-3 py-1.5 font-semibold">Lot</th>
                        <th className="px-3 py-1.5 font-semibold">Result</th>
                        {editable && <th className="px-3 py-1.5" />}
                      </tr>
                    </thead>
                    <tbody>
                      {mine.rows.map((s) => {
                        const sev = severityOf(s.flags);
                        return (
                          <tr key={s.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                            <td className="px-3 py-1.5 font-mono">{s.serial || "—"}</td>
                            <td className="px-3 py-1.5 font-mono">{s.lot || "—"}</td>
                            <td className="px-3 py-1.5">
                              {sev === "ok" ? (
                                <span className={`rounded-full px-2 py-0.5 font-semibold ${CHIP.ok}`}>OK</span>
                              ) : (
                                <div className="flex flex-wrap gap-1" title={s.note}>
                                  {s.flags.map((f) => (
                                    <span key={f} className={`rounded-full px-2 py-0.5 font-semibold ${severityOf([f]) === "stop" ? CHIP.stop : CHIP.warn}`}>
                                      {FLAG_LABELS[f]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            {editable && (
                              <td className="px-3 py-1.5 text-right">
                                <button type="button" aria-label={`Remove ${s.serial || s.lot}`} className="rounded px-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700 dark:hover:bg-slate-800" onClick={() => void remove(s.id)}>
                                  Remove
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">Everything recorded on this shipment</h4>
            <div className="mt-2 space-y-2">
              {rows.map((r) => {
                const n = numbersFor(serials, r.id);
                return (
                  <div key={r.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                    <p className="font-semibold text-slate-900 dark:text-slate-50">
                      {r.productName} <span className="font-normal text-slate-500">· {n.lots.length} lot{n.lots.length === 1 ? "" : "s"}, {n.serials.length} serial{n.serials.length === 1 ? "" : "s"}</span>
                    </p>
                    <p className="mt-1 break-words font-mono"><span className="font-sans font-semibold text-slate-500">Lots: </span>{joinNumberList(n.lots) || "none yet"}</p>
                    <p className="mt-1 break-words font-mono"><span className="font-sans font-semibold text-slate-500">Serials: </span>{joinNumberList(n.serials) || "none yet"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {liveShot && (
        <CameraCapture
          title="Group photo of the lot and serial numbers"
          multiple
          fitToUpload={false}
          onClose={() => setLiveShot(false)}
          onCapture={(file) => {
            addPhoto(file);
          }}
        />
      )}
    </div>
  );
}
