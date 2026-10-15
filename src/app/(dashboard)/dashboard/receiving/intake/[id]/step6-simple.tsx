"use client";

// The very simple Step 6 (flag `step6-simple`). Under the Items received table, one card per product that arrived:
//   1. type the lot numbers and serial numbers (commas between them) and press Save,
//   2. take photos of the lot and serial numbers (the screen asks for them),
//   3. when the product has a recall, the recall check fills itself in with the number, shows the manufacturer's
//      page, and the receiver says Affected or Not affected.
// No barcode scanning, no photo reading, no tabs. Every saved number is still checked on the server for repeats,
// made-up serials and the recall lists, exactly as before.

import { useState } from "react";
import { saveNumberBatch, type NumberOutcome } from "@/app/actions/receiving-numbers";
import { removeScannedUnit } from "@/app/actions/receiving-scan";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import { normalizeNumber, recallsForProduct } from "@/lib/receiving-recall";
import { rowCheckStatus } from "@/lib/receiving-recall-status";
import { BATCH_CHUNK, buildEntries, splitNumberList } from "@/lib/receiving-number-list";
import type { SerialView } from "@/lib/receiving-serial-service";
import type { ItemState } from "./item-card";
import type { PackagePhoto } from "@/lib/receiving-queries";
import { PhotoSlot, field } from "./intake-parts";
import { ManageRecalls } from "./recall-check";
import { numbersFor } from "./numbers-tab";
import { useRecallRunner } from "./use-recall-runner";

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const btnPrimary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";
const linkBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-950 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-50 dark:hover:bg-sky-900/50";
const pill = {
  bad: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  warn: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-50",
  ok: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  muted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
} as const;
const outcomeTone = {
  bad: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
  ok: "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-50",
  info: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50",
} as const;

type Shared = {
  packageId: string;
  editable: boolean;
  recalls: RecallView[];
  checks: RecallCheckView[];
  serials: SerialView[];
  photos: PackagePhoto[];
  storageOk: boolean;
  onSerials: (s: SerialView[]) => void;
  onChecks: (c: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
};

export function Step6Simple({
  items,
  isAdminUser,
  onRecalls,
  ...shared
}: Shared & {
  items: ItemState[];
  isAdminUser: boolean;
  onRecalls: (r: RecallView[]) => void;
}) {
  const rows = items.filter((i) => i.productName.trim() && i.wasReceived !== "NO");
  return (
    <div className="mt-6" id="step6-simple" data-step6-simple>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Lot &amp; serial numbers</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
        For each product: type the lot numbers and serial numbers, and take a photo of them. If the product has a recall, the recall check opens by itself.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Add a received product in the table above first.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((r, i) => (
            <ProductCard key={r.id} n={i + 1} row={r} {...shared} />
          ))}
        </div>
      )}
      {isAdminUser && <ManageRecalls recalls={shared.recalls} onRecalls={onRecalls} onError={shared.onError} />}
    </div>
  );
}

function ProductCard({ n, row, ...p }: Shared & { n: number; row: ItemState }) {
  const { packageId, editable, recalls, checks, serials, photos, storageOk, onSerials, onChecks, onPatchMany, onError } = p;
  const [lotsText, setLotsText] = useState("");
  const [serialsText, setSerialsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<NumberOutcome[]>([]);
  const [picked, setPicked] = useState("");
  const [copied, setCopied] = useState(false);
  const runner = useRecallRunner({ packageId, recalls, onChecks, onPatchMany, onError });

  const active = recalls.filter((r) => r.active);
  const mine = recallsForProduct(row.productName, active);
  const myChecks = checks.filter((c) => c.itemId === row.id);
  const status = rowCheckStatus(mine, myChecks);
  const nums = numbersFor(serials, row.id);
  const lots = splitNumberList(lotsText);
  const sers = splitNumberList(serialsText);

  // The number the recall check uses: the one picked, else the row's own lot, else the first number saved.
  const choices = [...new Set([row.lotNumber.trim(), ...nums.lots, ...nums.serials].filter((x) => x && normalizeNumber(x).length >= 4))];
  const number = picked && choices.includes(picked) ? picked : (choices[0] ?? "");

  async function save() {
    if (lots.length + sers.length === 0) return onError("Type at least one lot or serial number first.");
    const entries = buildEntries(lots, sers);
    setSaving(true);
    const all: NumberOutcome[] = [];
    let done = 0;
    try {
      for (let i = 0; i < entries.length; i += BATCH_CHUNK) {
        const chunk = entries.slice(i, i + BATCH_CHUNK);
        const r = await saveNumberBatch(packageId, row.id, chunk, "TYPED");
        if (r.error || !r.outcomes) {
          onError(r.error ?? "That didn't save. Check the connection and press Save again; numbers already saved are not repeated.");
          break;
        }
        all.push(...r.outcomes);
        if (r.serials) onSerials(r.serials);
        if (r.checks) onChecks(r.checks);
        if (r.itemPatches) onPatchMany(r.itemPatches as Record<string, Partial<ItemState>>);
        done = i + chunk.length;
      }
    } catch {
      onError("That didn't save. Check the connection and press Save again; numbers already saved are not repeated.");
    }
    setSaving(false);
    setSaved(all);
    if (done >= entries.length) {
      setLotsText("");
      setSerialsText("");
    } else {
      const left = entries.slice(done);
      setLotsText(left.filter((e) => !e.serial && e.lot).map((e) => e.lot).join(", "));
      setSerialsText(left.filter((e) => e.serial).map((e) => e.serial).join(", "));
    }
  }

  async function remove(id: string) {
    const r = await removeScannedUnit(packageId, id);
    if (r.error) return onError(r.error);
    if (r.serials) onSerials(r.serials);
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the number is shown on screen anyway */
    }
  }

  const problems = saved.filter((o) => ["STOP", "RECALLED", "NEAR"].includes(o.status));
  const warns = saved.filter((o) => o.status === "WARN" || o.status === "ALREADY" || o.status === "SKIPPED");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" data-step6-card={row.id}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
          {n}. {row.productName}
        </h4>
        {row.quantityReceived && <span className="text-sm text-slate-500">{row.quantityReceived} received</span>}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill[status.tone]}`} data-step6-status={status.key}>
          {status.label}
        </span>
      </header>

      {editable && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor={`s6-lots-${row.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lot numbers</label>
            <textarea id={`s6-lots-${row.id}`} rows={2} className={`${field} mt-1`} placeholder="Type them with a comma between" value={lotsText} disabled={saving} onChange={(e) => setLotsText(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`s6-sers-${row.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serial numbers</label>
            <textarea id={`s6-sers-${row.id}`} rows={2} className={`${field} mt-1`} placeholder="Type them with a comma between" value={serialsText} disabled={saving} onChange={(e) => setSerialsText(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <button type="button" className={btnPrimary} disabled={saving || lots.length + sers.length === 0} onClick={save}>
              {saving ? "Saving…" : lots.length + sers.length > 0 ? `Save ${lots.length + sers.length} number${lots.length + sers.length === 1 ? "" : "s"}` : "Save numbers"}
            </button>
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div role="status" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${problems.length ? outcomeTone.bad : warns.length ? outcomeTone.info : outcomeTone.ok}`}>
          <p className="font-semibold">
            {problems.length ? "Look at this before you go on" : warns.length ? "Saved, with a note" : `Saved ${saved.length} number${saved.length === 1 ? "" : "s"}`}
          </p>
          {[...problems, ...warns].map((o) => (
            <p key={`${o.kind}-${o.label}`} className="mt-1">
              <span className="font-mono">{o.label}</span>: {o.notes.join(" ") || o.status}
            </p>
          ))}
        </div>
      )}

      {(nums.lots.length > 0 || nums.serials.length > 0) && (
        <div className="mt-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved ({nums.lots.length} lot, {nums.serials.length} serial)</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {nums.rows.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                {s.serial ? `SN ${s.serial}` : `Lot ${s.lot}`}
                {editable && (
                  <button type="button" aria-label={`Remove ${s.serial || s.lot}`} className="ml-1 text-slate-500 hover:text-red-700" onClick={() => remove(s.id)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg bg-sky-50 px-3 py-3 dark:bg-sky-950/30">
        <p className="text-sm font-semibold text-sky-950 dark:text-sky-50">Take a photo of the lot number and serial number</p>
        <p className="mt-0.5 text-xs text-sky-900 dark:text-sky-100">Hold the camera close so every number can be read. Keep pharmacy stickers and patient names out of the picture.</p>
        <div className="mt-2">
          <PhotoSlot packageId={packageId} kind="ITEM_PRODUCT" itemId={row.id} photos={photos} editable={editable} storageOk={storageOk} onError={onError} compact />
        </div>
      </div>

      {mine.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700" data-step6-recall>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Recall check</p>
          {number.length < 4 ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Type and save a lot or serial number above. It goes into the recall check here by itself.</p>
          ) : (
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              Checking <span className="font-mono font-semibold">{number}</span>
              {choices.length > 1 && (
                <>
                  {" "}
                  <label htmlFor={`s6-pick-${row.id}`} className="sr-only">Number to check</label>
                  <select id={`s6-pick-${row.id}`} className={`${field} !inline-block !w-auto align-middle`} value={number} onChange={(e) => setPicked(e.target.value)}>
                    {choices.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </>
              )}
            </p>
          )}

          {runner.outcome && (
            <div role="status" className={`mt-3 rounded-lg border px-4 py-3 text-sm ${outcomeTone[runner.outcome.tone]}`}>
              <p className="text-base font-bold">{runner.outcome.title}</p>
              {runner.outcome.lines.map((l) => (
                <p key={l} className="mt-1">{l}</p>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-4">
            {mine.map((r) => (
              <div key={r.id} data-recall-card>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {r.name}
                  {r.manufacturer && <span className="font-normal text-slate-500"> · {r.manufacturer}</span>}
                </p>
                {r.numberHint && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{r.numberHint}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {r.lookupUrl && (
                    <a
                      className={linkBtn}
                      href={r.lookupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (number) void copyNumber();
                      }}
                    >
                      {r.lookupLabel || "Open the manufacturer's recall page"} <span aria-hidden>↗</span>
                    </a>
                  )}
                  {r.noticeUrl && (
                    <a className="text-xs font-medium text-sky-800 underline decoration-dotted underline-offset-2 dark:text-sky-300" href={r.noticeUrl} target="_blank" rel="noopener noreferrer">
                      Read the recall notice ↗
                    </a>
                  )}
                  {copied && <span className="text-xs text-slate-500">Number copied, paste it on their page.</span>}
                </div>
                {editable && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {number.length >= 4 ? <>What did their page say for <span className="font-mono">{number}</span>?</> : "Save a number first, then say what their page showed."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={runner.pending || number.length < 4} onClick={() => runner.confirm(row, r.id, number, true)}>
                        Affected
                      </button>
                      <button type="button" className={btn} disabled={runner.pending || number.length < 4} onClick={() => runner.confirm(row, r.id, number, false)}>
                        Not affected
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
