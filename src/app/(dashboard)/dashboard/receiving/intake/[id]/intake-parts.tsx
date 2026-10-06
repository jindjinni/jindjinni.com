"use client";

// Building blocks shared by the Receiving Intake Form: label rows, step sections,
// Yes/No pills, and the photo / document uploader.

import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { deleteReceivingPhoto, uploadReceivingPhoto } from "@/app/actions/receiving";
import { prepareUploadFile } from "@/lib/client-image";
import type { PackagePhoto } from "@/lib/receiving-queries";
import { DOCUMENT_PHOTO_KINDS, MAX_PHOTOS_PER_KIND, type PhotoKind } from "@/lib/receiving-rules";
import { CameraCapture, useCameraSupported } from "./camera-capture";

export const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800";

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5 border-b border-slate-100 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4 dark:border-slate-800/70">
      <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
        {label}
        {hint && <p className="mt-0.5 text-xs font-normal text-slate-500">{hint}</p>}
      </div>
      <div className="min-w-0 max-w-3xl text-sm text-slate-900 dark:text-slate-50">{children}</div>
    </div>
  );
}

/** `highlight` marks the step the person viewing it is meant to work in (Accounts sees Step 10 this way): a colored frame and a badge with that text. */
export function Step({ n, id, title, note, highlight, children }: { n: number; id: string; title: string; note?: string; highlight?: string; children: ReactNode }) {
  return (
    <section id={id} data-highlight={highlight ? "true" : undefined} className={`mt-7 scroll-mt-28 ${highlight ? "rounded-xl border-2 border-[var(--dept-accent,#60a5fa)] bg-white p-4 shadow-md dark:bg-slate-900" : ""}`}>
      <h2 className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 pb-2 text-base font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-50">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--dept-accent,#F7B838)] px-1.5 text-xs font-bold text-amber-950">{n}</span>
        {title}
        {highlight && <span className="ml-auto rounded-full bg-[var(--dept-accent,#60a5fa)] px-3 py-0.5 text-xs font-bold text-emerald-950">{highlight}</span>}
      </h2>
      {note && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{note}</p>}
      {children}
    </section>
  );
}

export type Tone = "good" | "bad" | "warn";
export type ChoiceOption = { value: string; label: string; tone: Tone };

export function Choice({
  name,
  value,
  onChange,
  options,
  disabled,
  allowClear,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  disabled: boolean;
  allowClear?: boolean;
}) {
  const tones = {
    good: "peer-checked:bg-green-600 peer-checked:text-white",
    bad: "peer-checked:bg-red-600 peer-checked:text-white",
    warn: "peer-checked:bg-amber-500 peer-checked:text-white",
  };
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap items-center gap-2">
      {options.map((o) => (
        <label key={o.value} className={disabled ? "opacity-80" : "cursor-pointer"}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className="peer sr-only"
          />
          <span
            className={`inline-block rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${tones[o.tone]}`}
          >
            {o.label}
          </span>
        </label>
      ))}
      {allowClear && value && !disabled && (
        <button type="button" onClick={() => onChange("")} className="text-xs text-slate-500 underline">
          clear
        </button>
      )}
    </div>
  );
}

export const YN: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "good" },
  { value: "NO", label: "No", tone: "bad" },
];
/** Yes is the bad answer (damage, adjustment needed...). */
export const YN_RISK: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "bad" },
  { value: "NO", label: "No", tone: "good" },
];
export const YN_NA: ChoiceOption[] = [
  { value: "YES", label: "Yes", tone: "good" },
  { value: "NO", label: "No", tone: "bad" },
  { value: "NA", label: "N/A", tone: "warn" },
];

/** Whether the signed-in person may add photos to the shipment being shown (true for receiving staff even after it is submitted). */
export const PhotoAddContext = createContext<boolean | null>(null);

export function PhotoSlot({
  packageId,
  kind,
  itemId,
  photos,
  editable,
  canAdd: canAddProp,
  storageOk,
  onError,
  compact,
}: {
  packageId: string;
  kind: PhotoKind;
  itemId?: string;
  photos: PackagePhoto[];
  /** Removing photos: only while the shipment is in progress. */
  editable: boolean;
  /** Adding photos: defaults to the shipment-wide setting, which stays on after the shipment is submitted. */
  canAdd?: boolean;
  storageOk: boolean;
  onError: (m: string) => void;
  compact?: boolean;
}) {
  const ctxCanAdd = useContext(PhotoAddContext);
  const canAdd = canAddProp ?? ctxCanAdd ?? editable;
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [camOpen, setCamOpen] = useState(false);
  const canCam = useCameraSupported();
  const mine = photos.filter((p) => p.kind === kind && (p.itemId ?? null) === (itemId ?? null));
  const pdfOk = DOCUMENT_PHOTO_KINDS.includes(kind);
  const size = compact ? "h-20 w-20" : "h-24 w-24";

  /** Uploads each file (chosen from the computer, or taken with the live camera) one after the other. Returns true when all went through. */
  async function addFiles(files: File[]): Promise<boolean> {
    if (files.length === 0) return true;
    onError("");
    setBusy(true);
    let ok = true;
    try {
      for (const file of files) {
        const prepared = await prepareUploadFile(file);
        if ("error" in prepared) {
          onError(prepared.error);
          ok = false;
          break;
        }
        const fd = new FormData();
        fd.set("file", prepared);
        const res = await uploadReceivingPhoto(packageId, kind, fd, itemId ?? null);
        if (res.error) {
          onError(res.error);
          ok = false;
          break;
        }
      }
    } catch {
      onError("Couldn't add that file. Try again.");
      ok = false;
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
    return ok;
  }
  async function add(files: FileList | null) {
    await addFiles(files ? Array.from(files) : []);
  }

  function remove(id: string) {
    onError("");
    startTransition(async () => {
      const res = await deleteReceivingPhoto(id);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  }

  const full = mine.length >= MAX_PHOTOS_PER_KIND;
  const ready = canAdd && storageOk && !busy && !full;

  return (
    <div>
      <div
        className={`flex flex-wrap gap-2 rounded-lg ${dragOver ? "outline-dashed outline-2 outline-offset-4 outline-sky-500" : ""}`}
        onDragOver={(e) => {
          if (!ready) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          if (!ready) return;
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || (pdfOk && f.type === "application/pdf"));
          void addFiles(dropped.slice(0, MAX_PHOTOS_PER_KIND - mine.length));
        }}
      >
        {mine.map((p) => (
          <div key={p.id} className="group relative">
            <a href={`/api/receiving/photos/${p.id}`} target="_blank" rel="noreferrer" title={p.filename}>
              {p.contentType === "application/pdf" ? (
                <span className={`flex ${size} flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1 text-center text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}>
                  <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
                  <span className="line-clamp-2 break-all">{p.filename}</span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/receiving/photos/${p.id}`} alt={p.filename} loading="lazy" className={`${size} rounded-lg border border-slate-200 object-cover dark:border-slate-700`} />
              )}
            </a>
            {editable && (
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label={`Remove ${p.filename}`}
                className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-slate-900 text-xs font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {mine.length === 0 && !canAdd && <span className="text-slate-500">None</span>}
        {canAdd && !full && (
          <label
            className={`flex ${size} flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center text-xs font-medium ${
              storageOk ? "cursor-pointer border-amber-400 text-amber-900 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40" : "cursor-not-allowed border-slate-300 text-slate-400"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden="true">{busy ? "…" : "+"}</span>
            {busy ? "Adding" : pdfOk ? "Choose file" : "Choose photo"}
            <input
              ref={input}
              id={`photo-${kind}${itemId ? `-${itemId}` : ""}`}
              type="file"
              accept={pdfOk ? "image/png,image/jpeg,image/webp,image/gif,application/pdf" : "image/png,image/jpeg,image/webp,image/gif"}
              multiple
              disabled={!storageOk || busy}
              className="sr-only"
              onChange={(e) => add(e.target.files)}
            />
          </label>
        )}
        {canAdd && !full && canCam && (
          <button
            type="button"
            disabled={!storageOk || busy}
            onClick={() => setCamOpen(true)}
            className={`flex ${size} flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center text-xs font-medium ${
              storageOk ? "cursor-pointer border-sky-400 text-sky-900 hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950/40" : "cursor-not-allowed border-slate-300 text-slate-400"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden="true">◉</span>
            Live camera
          </button>
        )}
      </div>
      {camOpen && (
        <CameraCapture
          title="Take photos with the camera"
          onClose={() => setCamOpen(false)}
          onCapture={(file) => addFiles([file])}
        />
      )}
      {canAdd && !storageOk && <p className="mt-1 text-xs text-slate-500">Photo storage isn&apos;t connected yet.</p>}
      {canAdd && storageOk && (
        <p className="mt-1 text-xs text-slate-500">
          {full
            ? `That's the limit of ${MAX_PHOTOS_PER_KIND} here. Remove one to add another.`
            : `Add as many as you need: select several files at once, drag them in from any folder, or take one shot after another with Live camera.${mine.length ? ` ${mine.length} of ${MAX_PHOTOS_PER_KIND} added.` : ""}`}
        </p>
      )}
    </div>
  );
}
