"use client";

// Step 6: check a received product's lot / serial number against the recalls, without leaving the shipment.
// Type it, scan the barcode with the camera, or take a photo of the label. Official lookup pages open in a new tab.

import { useEffect, useRef, useState, useTransition } from "react";
import {
  checkRecall,
  confirmRecallLookup,
  importRecallList,
  previewRecallList,
  readRecallPhoto,
  removeRecall,
  removeRecallCheck,
  saveRecall,
  setupRecalls,
  type RecallActionState,
  type RecallItemPatch,
} from "@/app/actions/receiving-recalls";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import { RECALL_RESULT_LABELS, isRecalledResult, normalizeNumber, parseGs1, recallsForProduct } from "@/lib/receiving-recall";
import type { ItemState } from "./item-card";
import { field } from "./intake-parts";

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";
const btnPrimary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";
const linkBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/50";

type Outcome = { tone: "bad" | "ok" | "info"; title: string; lines: string[] };

/** Shrinks a phone photo before it is sent: label text stays readable at 1600px and the upload stays small. */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], "label.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function RecallCheck({
  packageId,
  items,
  editable,
  isAdminUser,
  photoReading,
  initialRecalls,
  initialChecks,
  onPatchMany,
  onChecks,
  onError,
}: {
  packageId: string;
  items: ItemState[];
  editable: boolean;
  isAdminUser: boolean;
  photoReading: boolean;
  initialRecalls: RecallView[];
  initialChecks: RecallCheckView[];
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onChecks: (checks: RecallCheckView[]) => void;
  onError: (m: string) => void;
}) {
  const [recalls, setRecalls] = useState(initialRecalls);
  const [checks, setChecks] = useState(initialChecks);
  const rows = items.filter((i) => i.productName.trim());
  const [rowId, setRowId] = useState("");
  const [input, setInput] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const [lookedUp, setLookedUp] = useState<Record<string, boolean>>({});

  const row = rows.find((r) => r.id === rowId) ?? rows[0];
  const rowChecks = checks.filter((c) => c.itemId === row?.id);
  const matching = row ? recallsForProduct(row.productName, recalls) : [];
  const shown = recalls.filter((r) => r.active);

  useEffect(() => () => stopRef.current?.(), []);

  function applyPatch(itemId: string, p?: RecallItemPatch) {
    if (!p) return;
    onPatchMany({
      [itemId]: {
        needsReturn: p.needsReturn,
        returnStatus: p.returnStatus,
        quantityToReturn: p.quantityToReturn,
        returnNotes: p.returnNotes,
      },
    });
  }
  function took(r: RecallActionState) {
    if (r.checks) {
      setChecks(r.checks);
      onChecks(r.checks);
    }
  }

  function run(text: string, forRow = row) {
    if (!forRow) return;
    setOutcome(null);
    start(async () => {
      const r = await checkRecall(packageId, forRow.id, text);
      if (r.error) {
        onError(r.error);
        return;
      }
      took(r);
      applyPatch(forRow.id, r.itemPatch);
      const hits = (r.results ?? []).filter((x) => x.recalls.length > 0);
      if (hits.length > 0) {
        setOutcome({
          tone: "bad",
          title: `RECALLED: ${forRow.productName}`,
          lines: [
            ...hits.map((h) => `${h.number} is on the recall list for ${h.recalls.join(", ")}.`),
            "Do not accept this product. The row is marked Needs To Be Returned: Yes (Return Requested).",
          ],
        });
      } else {
        const nums = (r.results ?? []).map((x) => x.number).join(", ");
        const mine = recallsForProduct(forRow.productName, recalls);
        const loaded = mine.filter((m) => m.numberCount + m.prefixCount > 0);
        const date = loaded.map((m) => m.listUpdatedAt).filter(Boolean).sort().pop();
        setOutcome({
          tone: "info",
          title: "Not on the recall lists we have",
          lines: [
            `${nums} was not found${date ? ` (our list was last updated ${date})` : mine.length && loaded.length === 0 ? " (no list is loaded for this product yet)" : ""}.`,
            "That does not mean the product is safe. Confirm on the manufacturer's page below, then record what it said.",
          ],
        });
      }
    });
  }

  // The text a scan or photo gave: fill the row's lot (and date) if empty, then check it.
  function applyScanned(text: string) {
    if (!row) return;
    const g = parseGs1(text);
    if (g) {
      const patch: Partial<ItemState> = {};
      if (g.lot && !row.lotNumber.trim() && row.lots.every((l) => !l.lotNumber.trim())) patch.lotNumber = g.lot;
      if (g.expiry && !row.expirationDate && !row.expirationEntryType) {
        patch.expirationDate = g.expiry;
        patch.expirationEntryType = "SINGLE";
      }
      if (Object.keys(patch).length) onPatchMany({ [row.id]: patch });
    }
    if (g?.lot && row.lotNumber.trim() && normalizeNumber(row.lotNumber) !== normalizeNumber(g.lot)) {
      setScanMsg(`The label says lot ${g.lot}, but this row has lot ${row.lotNumber}. Check which one is right.`);
    }
    const toCheck = g ? [g.lot, g.serial].filter(Boolean).join(" ") : text;
    setInput(toCheck);
    run(toCheck);
  }

  async function startScan() {
    if (!row) {
      onError("Add the product to the list above first, then check it.");
      return;
    }
    setScanMsg("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanMsg("This browser can't open the camera. Use Take a photo or type the number.");
      return;
    }
    setScanning(true);
    try {
      const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      // Wait for the video element to be on the page.
      await new Promise((r) => setTimeout(r, 50));
      if (!videoRef.current) return;
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result, _err, c) => {
        if (result) {
          c.stop();
          stopRef.current = null;
          setScanning(false);
          applyScanned(result.getText());
        }
      });
      stopRef.current = () => controls.stop();
    } catch (e) {
      setScanning(false);
      const denied = e instanceof Error && /denied|permission|notallowed/i.test(`${e.name} ${e.message}`);
      setScanMsg(denied ? "Camera access was blocked. Allow the camera for this site in the browser, or use Take a photo." : "Couldn't start the camera. Use Take a photo or type the number.");
    }
  }
  function stopScan() {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !row) return;
    setScanMsg("Reading the photo…");
    // First try to find a barcode in the picture (free, no upload); then ask the photo reader.
    try {
      const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const url = URL.createObjectURL(file);
      try {
        const res = await new BrowserMultiFormatReader(hints).decodeFromImageUrl(url);
        setScanMsg("");
        applyScanned(res.getText());
        return;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      /* no barcode found: fall through to the photo reader */
    }
    if (!photoReading) {
      setScanMsg("No barcode found in that photo. Type the number, or ask an admin to switch on photo reading.");
      return;
    }
    const small = await shrinkPhoto(file);
    const fd = new FormData();
    fd.set("photo", small);
    const r = await readRecallPhoto(fd);
    if (r.error || !r.label) {
      setScanMsg("");
      onError(r.error ?? "Couldn't read that photo.");
      return;
    }
    setScanMsg("");
    const l = r.label;
    const text = l.barcodeText && parseGs1(l.barcodeText) ? l.barcodeText : [l.lot, l.serial].filter(Boolean).join(" ");
    if (l.expiry) setScanMsg(`Read from the photo: ${[l.lot && `lot ${l.lot}`, l.serial && `serial ${l.serial}`].filter(Boolean).join(", ")}. Check it matches the label.`);
    applyScanned(text);
  }

  function confirm(recallId: string, affected: boolean) {
    if (!row) return;
    const n = normalizeNumber(input);
    if (n.length < 4) {
      onError("Type or scan the lot / serial number you looked up first.");
      return;
    }
    start(async () => {
      const r = await confirmRecallLookup(packageId, row.id, recallId, input, affected);
      if (r.error) return onError(r.error);
      took(r);
      applyPatch(row.id, r.itemPatch);
      setOutcome(
        affected
          ? { tone: "bad", title: `RECALLED: ${row.productName}`, lines: ["Recorded as affected. The row is marked Needs To Be Returned: Yes (Return Requested)."] }
          : { tone: "ok", title: "Recorded: not affected", lines: ["The manufacturer's page showed this number is not affected. This is saved with the shipment."] },
      );
    });
  }

  function removeCheck(id: string) {
    start(async () => {
      const r = await removeRecallCheck(packageId, id);
      if (r.error) return onError(r.error);
      took(r);
    });
  }

  const toneClass = {
    bad: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
    ok: "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-50",
    info: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50",
  } as const;

  return (
    <div className="mt-8" id="recall-check">
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Recall check</h3>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={!editable || scanning} onClick={startScan}>
              <span aria-hidden>▣</span> Scan barcode with camera
            </button>
            <button type="button" className={btn} disabled={!editable} onClick={() => photoRef.current?.click()}>
              <span aria-hidden>◉</span> Take or choose a photo of the label
            </button>
            <input ref={photoRef} id="recall-photo" type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Photo of the label" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void onPhoto(f); }} />
            <span className="text-xs text-slate-500">{photoReading ? "If there is no barcode, the label text is read for the lot and serial number." : "Photos work for barcodes and QR codes."}</span>
          </div>
          <p className="mt-2 max-w-3xl rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
            <strong>Photo tip:</strong> frame only the side of the box or product with the lot number, serial number or barcode. Keep pharmacy stickers and anything with a patient&apos;s name out of the picture.
            {photoReading ? " If no barcode is found, the photo is sent to an outside reading service (Anthropic) to pick out the numbers. This app does not store it, but the service may keep it for a short time." : ""}
            {" "}A USB or Bluetooth barcode scanner works too: click the number box, scan, and the check runs by itself.
          </p>
          {scanMsg && <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">{scanMsg}</p>}

          {scanning && (
            <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-slate-300 bg-black dark:border-slate-600">
              <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Camera view: point at the barcode" />
              <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-xs text-slate-200">
                <span>Hold the barcode or QR code inside the picture. Keep patient stickers out of view.</span>
                <button type="button" className="rounded border border-slate-500 px-2 py-1 font-medium text-white hover:bg-slate-800" onClick={stopScan}>
                  Stop
                </button>
              </div>
            </div>
          )}

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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isRecalledResult(c.result) ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{RECALL_RESULT_LABELS[c.result]}</span>
                  {c.recallName && <span className="text-xs text-slate-500">{c.recallName}</span>}
                  {editable && (
                    <button type="button" aria-label={`Remove check ${c.enteredNumber}`} className="ml-auto rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-red-700 dark:hover:bg-slate-800" onClick={() => removeCheck(c.id)}>
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

      {isAdminUser && <ManageRecalls recalls={recalls} onRecalls={setRecalls} onError={onError} />}
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
