"use client";

// Step 6 scan station: the receiving agent scans every unit with a USB / Bluetooth barcode scanner (it types into the box
// below like a keyboard), the camera, or a photo. Each scan is saved on the product, checked for a repeated serial, a
// made-up or wrong-shaped serial, a bad product code, an expired date and the recall lists, and anything suspect is
// flagged and sent to review. "OK" never means the serial is proven real -- the manufacturers do not publish that.

import { useEffect, useRef, useState } from "react";
import { removeScannedUnit, scanUnit, type ScanResult } from "@/app/actions/receiving-scan";
import type { RecallCheckView } from "@/lib/receiving-recall-service";
import { normalizeNumber } from "@/lib/receiving-recall";
import type { SerialView } from "@/lib/receiving-serial-service";
import { FLAG_LABELS, brandFor, isCounterfeitSuspect, parseScan, productKind, rowForScan, severityOf, type ScanKind, type SerialFlag } from "@/lib/receiving-serial-rules";
import type { ItemState } from "./item-card";
import { field } from "./intake-parts";
import { ScanTools } from "./scan-tools";

const TONE = {
  stop: "border-red-400 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950/40 dark:text-red-50",
  warn: "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-50",
  ok: "border-green-400 bg-green-50 text-green-950 dark:border-green-700 dark:bg-green-950/30 dark:text-green-50",
} as const;

const CHIP = {
  stop: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  ok: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
} as const;

/** A short tone so the agent can keep their eyes on the box, not the screen: one high beep for OK, two low ones for a problem. */
function beep(kind: "ok" | "warn" | "stop") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = kind === "ok" ? [[880, 0, 0.09]] : kind === "warn" ? [[520, 0, 0.18]] : [[260, 0, 0.18], [260, 0.25, 0.18]];
    for (const [freq, at, len] of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + len);
    }
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* no sound is fine */
  }
}

type Shown = { tone: "stop" | "warn" | "ok"; title: string; lines: string[] };

export function ScanStation({
  packageId,
  items,
  editable,
  photoReading,
  serials,
  onSerials,
  onChecks,
  onPatchMany,
  onError,
}: {
  packageId: string;
  items: ItemState[];
  editable: boolean;
  photoReading: boolean;
  serials: SerialView[];
  onSerials: (s: SerialView[]) => void;
  onChecks: (c: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
}) {
  const rows = items.filter((i) => i.productName.trim());
  const [rowId, setRowId] = useState("");
  const [auto, setAuto] = useState(true);
  const [kind, setKind] = useState<ScanKind>("AUTO");
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [sound, setSound] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const typing = useRef({ at: 0 });
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The latest rows / serials for the queued scans (a scan waiting in line must see the scan before it).
  const live = useRef({ rows, serials, rowId });
  useEffect(() => {
    live.current = { rows, serials, rowId };
  });

  const row = rows.find((r) => r.id === rowId) ?? rows[0];
  function show(r: ScanResult, item: ItemState) {
    const scan = r.scan;
    const flags: SerialFlag[] = scan?.flags ?? [];
    const sev = (r.recalled && r.recalled.length > 0) || (r.near && r.near.length > 0) ? "stop" : r.unverified && r.unverified.length > 0 && severityOf(flags) === "ok" ? "warn" : severityOf(flags);
    const lines = [...(r.notes ?? [])];
    let title = "";
    if (r.productCodeOnly) {
      setShown({ tone: sev === "ok" ? "warn" : sev, title: sev === "ok" ? "Product code read" : "Check this product code", lines });
      return beep(sev === "ok" ? "ok" : sev);
    }
    if (r.recalled && r.recalled.length > 0) {
      title = `RECALLED: ${item.productName}`;
      lines.unshift(...r.recalled.map((x) => `${x.number} is on the recall list for ${x.recalls.join(", ")}. Do not accept this product; the row is marked Needs To Be Returned.`));
    } else if (r.near && r.near.length > 0) {
      title = `LOOKS LIKE A RECALLED NUMBER: ${item.productName}`;
      lines.unshift(...r.near.map((k) => `${k.number} is very close to ${k.listed} (${k.recall}). Read the label again, character by character, against the recall notice.`));
      lines.push("The row is held in Pending review until a manager decides.");
    } else if (isCounterfeitSuspect(flags)) {
      title = `STOP: possible counterfeit (${item.productName})`;
      lines.push("The row is marked Pending review in Needs To Be Returned. Set the product aside and ask a manager.");
    } else if (flags.includes("EXPIRED")) {
      title = `EXPIRED: ${item.productName}`;
    } else if (sev === "warn") {
      title = `Check this one (${item.productName})`;
    } else if (r.alreadyScanned) {
      title = "Already scanned on this product";
    } else {
      const n = (r.serials ?? []).filter((s) => s.itemId === item.id).length || 1;
      title = r.unverified && r.unverified.length > 0 ? `SAVED, BUT RECALL NOT CONFIRMED: ${item.productName}` : `OK: ${item.productName}`;
      if (r.unverified && r.unverified.length > 0) {
        lines.unshift(`Saved unit ${n}. No repeat and nothing wrong with the format, but no recall list is loaded for ${r.unverified.join(", ")}. Look the number up on the manufacturer's page (Recall check box) before you submit.`);
      } else {
        lines.unshift(`Saved unit ${n}. No repeat, no recall match and nothing wrong with the format.`);
      }
      lines.push("OK does not prove the serial is real. Manufacturers do not publish serial lists, so this catches repeats, made-up numbers and recalls.");
    }
    if (scan) {
      const bits = [scan.serial && `Serial ${scan.serial}`, scan.lot && `Lot ${scan.lot}`, scan.expiry && `Expires ${scan.expiry}`].filter(Boolean).join(" · ");
      if (bits) lines.unshift(bits);
    }
    const tone = r.alreadyScanned ? "warn" : sev;
    setShown({ tone, title, lines });
    if (sound) beep(tone);
  }

  /** Fills the row's lot and expiry from a GS1 barcode and warns when the label's lot is not the lot typed on the row. */
  function fillRow(item: ItemState, text: string): string | null {
    const p = parseScan(text, { kind, productName: item.productName });
    if (!p || !p.lot) return null;
    const patch: Partial<ItemState> = {};
    const rowLots = [item.lotNumber, ...item.lots.map((l) => l.lotNumber)].filter((l) => l.trim()).map(normalizeNumber);
    if (rowLots.length === 0) patch.lotNumber = p.lot;
    if (p.expiry && !item.expirationDate && !item.expirationEntryType) {
      patch.expirationDate = p.expiry;
      patch.expirationEntryType = "SINGLE";
    }
    if (Object.keys(patch).length) onPatchMany({ [item.id]: patch });
    if (rowLots.length > 0 && !rowLots.includes(normalizeNumber(p.lot))) {
      return `The label says lot ${p.lot}, but this row has lot ${[item.lotNumber, ...item.lots.map((l) => l.lotNumber)].filter(Boolean).join(" / ")}. Check which one is right.`;
    }
    return null;
  }

  function submit(text: string, source: "SCANNER" | "CAMERA" | "PHOTO" | "TYPED") {
    const t = text.trim();
    if (!t) return;
    if (!editable) return;
    if (rows.length === 0) return onError("Add the received product above first, then scan it.");
    setWorking((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        const { rows: rs, rowId: sel } = live.current;
        const selected = rs.find((r) => r.id === sel) ?? rs[0];
        const parsed = parseScan(t, { kind, productName: selected.productName });
        const byScan = auto && parsed ? rowForScan(parsed, rs, gtinsByRowOf(live.current.serials)) : null;
        const target = rs.find((r) => r.id === byScan) ?? selected;
        if (target.id !== selected.id) setRowId(target.id);
        const mismatch = fillRow(target, t);
        const r = await scanUnit(packageId, target.id, t, source, kind);
        if (r.error) return onError(r.error);
        if (r.serials) onSerials(r.serials);
        if (r.checks) onChecks(r.checks);
        if (r.itemPatches) {
          const updates: Record<string, Partial<ItemState>> = {};
          for (const [id, p] of Object.entries(r.itemPatches)) updates[id] = p;
          onPatchMany(updates);
        }
        if (mismatch) r.notes = [...(r.notes ?? []), mismatch];
        show(r, target);
      } catch {
        onError("That scan didn't go through. Check the connection and scan it again.");
      } finally {
        setWorking((n) => n - 1);
        inputRef.current?.focus();
      }
    });
  }

  function onEnter() {
    const text = value;
    const elapsed = Date.now() - typing.current.at;
    const fast = text.length >= 6 && elapsed / text.length < 45;
    setValue("");
    typing.current.at = 0;
    submit(text, fast ? "SCANNER" : "TYPED");
  }

  async function remove(id: string) {
    const r = await removeScannedUnit(packageId, id);
    if (r.error) return onError(r.error);
    if (r.serials) onSerials(r.serials);
  }

  const byItem = (id: string) => serials.filter((s) => s.itemId === id);
  const flaggedCount = serials.filter((s) => severityOf(s.flags) === "stop").length;

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900" id="scan-station">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Scan station</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            Scan each unit on the product you received. Every scan is saved, checked for a repeated or made-up serial, a bad product code, an expired date and the recall lists. A serial that shows up twice means one of the two is very likely a counterfeit.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Beep on each scan
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Add a received product above, then scan its units here.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div>
              <label htmlFor="scan-row" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scanning into</label>
              <select id="scan-row" className={`${field} mt-1`} value={row?.id ?? ""} onChange={(e) => setRowId(e.target.value)}>
                {rows.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i + 1}. {r.productName}
                  </option>
                ))}
              </select>
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                <span>Pick the product from the scan (matches its product code or lot to a row above)</span>
              </label>
              {row && (
                <p className="mt-2 text-xs text-slate-500">
                  {brandFor(row.productName) ?? "Brand not recognised"}
                  {" · "}
                  {productKind(row.productName) === "SERIALIZED" ? "each unit has its own serial number" : productKind(row.productName) === "LOT_ONLY" ? "normally lot number only (no serial)" : "serial or lot"}
                </p>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="scan-box" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barcode scanner box</label>
                <div role="radiogroup" aria-label="What a plain barcode is" className="flex items-center gap-1 text-xs">
                  {(["AUTO", "SERIAL", "LOT"] as const).map((k) => (
                    <label key={k} className="cursor-pointer">
                      <input type="radio" name="scan-kind" className="peer sr-only" checked={kind === k} onChange={() => setKind(k)} />
                      <span className="rounded-full border border-slate-300 px-2.5 py-1 font-medium text-slate-700 peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky-600 dark:border-slate-600 dark:text-slate-200 dark:peer-checked:border-slate-100 dark:peer-checked:bg-slate-100 dark:peer-checked:text-slate-900">
                        {k === "AUTO" ? "Auto" : k === "SERIAL" ? "Serial" : "Lot"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  ref={inputRef}
                  id="scan-box"
                  className={`${field} min-w-[12rem] flex-1 font-mono text-base ${listening ? "ring-2 ring-green-500" : ""}`}
                  value={value}
                  placeholder="Click here, then scan with the handheld scanner"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={!editable}
                  onFocus={() => setListening(true)}
                  onBlur={() => setListening(false)}
                  onChange={(e) => {
                    if (!value) typing.current.at = Date.now();
                    setValue(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || (e.key === "Tab" && value.trim())) {
                      e.preventDefault();
                      onEnter();
                    }
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                  disabled={!editable || !value.trim()}
                  onClick={onEnter}
                >
                  Add scan
                </button>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${listening ? "bg-green-500" : "bg-slate-300"}`} />
                {listening ? "Ready: scan now. The scanner types the code and presses Enter by itself." : "Click the box first so the scanner's code lands in it. USB and Bluetooth scanners work like a keyboard."}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <ScanTools idPrefix="station" continuous disabled={!editable || !row} photoReading={photoReading} onText={(t, src) => submit(t, src)} onError={onError} />
          </div>

          {working > 0 && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">Checking…</p>}
          {shown && (
            <div role="status" aria-live="polite" className={`mt-4 rounded-xl border-2 px-4 py-3 text-sm ${TONE[shown.tone]}`}>
              <p className="text-base font-bold">{shown.title}</p>
              {shown.lines.map((l, i) => (
                <p key={`${i}:${l}`} className="mt-1 whitespace-pre-line">{l}</p>
              ))}
            </div>
          )}

          <div className="mt-6">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              Units scanned on this shipment{" "}
              <span className="font-normal text-slate-500">
                ({serials.length}
                {flaggedCount > 0 ? `, ${flaggedCount} flagged` : ""})
              </span>
            </h4>
            <ul className="mt-2 space-y-2">
              {rows.map((r) => {
                const mine = byItem(r.id);
                const flagged = mine.filter((s) => severityOf(s.flags) !== "ok").length;
                const received = Number(r.quantityReceived);
                return (
                  <li key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700">
                    <details open={flagged > 0}>
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                        <span className="font-semibold text-slate-900 dark:text-slate-50">{r.productName}</span>
                        <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                          {mine.length} scanned{Number.isFinite(received) && received > 0 ? ` of ${received} received` : ""}
                        </span>
                        {Number.isFinite(received) && received > 0 && mine.length > received && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP.warn}`}>More scanned than received</span>
                        )}
                        {flagged > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP.stop}`}>{flagged} flagged</span>}
                      </summary>
                      {mine.length === 0 ? (
                        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">Nothing scanned yet.</p>
                      ) : (
                        <div className="max-h-72 overflow-auto border-t border-slate-100 dark:border-slate-800">
                          <table className="w-full min-w-[34rem] text-left text-xs">
                            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800">
                              <tr>
                                <th className="px-3 py-1.5 font-semibold">Serial</th>
                                <th className="px-3 py-1.5 font-semibold">Lot</th>
                                <th className="px-3 py-1.5 font-semibold">Expiry</th>
                                <th className="px-3 py-1.5 font-semibold">Result</th>
                                {editable && <th className="px-3 py-1.5" />}
                              </tr>
                            </thead>
                            <tbody>
                              {mine.map((s) => {
                                const sev = severityOf(s.flags);
                                return (
                                  <tr key={s.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                                    <td className="px-3 py-1.5 font-mono">{s.serial || "—"}</td>
                                    <td className="px-3 py-1.5 font-mono">{s.lot || "—"}</td>
                                    <td className="px-3 py-1.5 tabular-nums">{s.expiry || "—"}</td>
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
                                        <button type="button" aria-label={`Remove scan ${s.serial || s.lot}`} className="rounded px-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700 dark:hover:bg-slate-800" onClick={() => void remove(s.id)}>
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
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function gtinsByRowOf(serials: SerialView[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const s of serials) {
    if (!s.gtin) continue;
    const list = (m[s.itemId] ??= []);
    if (!list.includes(s.gtin)) list.push(s.gtin);
  }
  return m;
}
