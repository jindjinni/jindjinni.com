"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadReceiptPdf, removeReceiptPdf } from "@/app/actions/purchasing-receipt-pdf";

export type ReceiptState = "UPLOADED" | "GENERATED" | "AUTO" | null;

const pdfUrl = (id: string, stamp: string, extra = "") => `/api/purchasing/quotations/${id}/receipt-pdf?v=${encodeURIComponent(stamp)}${extra}`;

function ReceiptIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
      <path d="M2 1h6.5L12 4.5V14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="#fee2e2" stroke="#dc2626" strokeWidth="1" />
      <path d="M8.5 1v3.5H12" stroke="#dc2626" strokeWidth="1" />
      <path d="M3.5 8h6M3.5 10.5h6M3.5 13h3.5" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

const MAX_BYTES = 4 * 1024 * 1024;

/** Phone photos and big screenshots are often over the 4 MB upload limit, so shrink them (JPEG, longest side 2200 px) before sending. PDFs and small images go as they are. */
async function prepareFile(file: File): Promise<File | { error: string }> {
  const isImage = file.type.startsWith("image/");
  if (isImage && file.type !== "image/gif" && file.size > 1.5 * 1024 * 1024) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
        if (blob && blob.size < file.size) {
          file = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        }
      }
    } catch {
      /* fall through: send the original and let the size check speak */
    }
  }
  if (file.size > MAX_BYTES) return { error: "That file is over 4 MB. Choose a smaller file or a lower-resolution photo." };
  return file;
}

/** One row's "Quotation Receipt" cell: a chip that opens the receipt (PDF, photo or screenshot) in a viewer on the same page, or an "Add receipt" button when the order has none. */
export function ReceiptCell({
  quotationId,
  label,
  receipt,
  stamp,
  isImage = false,
  canWrite,
}: {
  quotationId: string;
  label: string;
  receipt: ReceiptState;
  stamp: string;
  /** The attached file is a photo/screenshot (shown to fit the window) rather than a PDF. */
  isImage?: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(stamp);
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    startTransition(async () => {
      try {
        const prepared = await prepareFile(file);
        if ("error" in prepared) {
          setError(prepared.error);
          if (fileRef.current) fileRef.current.value = "";
          return;
        }
        const fd = new FormData();
        fd.set("file", prepared);
        const res = await uploadReceiptPdf(quotationId, fd);
        if (res.error) setError(res.error);
        else {
          setVersion(String(Date.now()));
          router.refresh();
        }
      } catch {
        setError("Couldn't attach that file. Try again.");
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function remove() {
    setError("");
    startTransition(async () => {
      const res = await removeReceiptPdf(quotationId);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  const picker = (
    <input
      ref={fileRef}
      id={`receipt-file-${quotationId}`}
      type="file"
      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif"
      className="sr-only"
      onChange={(e) => upload(e.target.files?.[0])}
    />
  );

  return (
    <>
      {receipt ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          title={`View receipt for ${label}`}
        >
          <ReceiptIcon /> Receipt
        </button>
      ) : canWrite ? (
        <>
          <label
            htmlFor={`receipt-file-${quotationId}`}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300 ${pending ? "opacity-60" : ""}`}
          >
            {pending ? "Attaching…" : "+ Add receipt"}
          </label>
          {picker}
          {error && <span role="alert" className="mt-1 block max-w-[10rem] whitespace-normal text-xs text-red-600">{error}</span>}
        </>
      ) : (
        <span className="text-slate-400">—</span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Receipt for ${label}`} onClick={() => setOpen(false)}>
          <div className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Quotation Receipt · {label}</p>
                <p className="text-xs text-slate-500">{receipt === "UPLOADED" ? "Attached file" : "Generated by Ledger"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <a href={pdfUrl(quotationId, version, "&download=1")} className="rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                  Download
                </a>
                <a href={pdfUrl(quotationId, version)} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                  Open in new tab
                </a>
                {canWrite && receipt && (
                  <>
                    <label htmlFor={`receipt-file-${quotationId}`} className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                      {pending ? "Attaching…" : receipt === "UPLOADED" ? "Replace file" : "Attach my own file"}
                    </label>
                    {picker}
                    {receipt === "UPLOADED" && (
                      <button type="button" disabled={pending} onClick={remove} className="rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300">
                        Remove
                      </button>
                    )}
                  </>
                )}
                <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
                  Close
                </button>
              </div>
            </div>
            {error && <p role="alert" className="bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
            {isImage ? (
              <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
                <div className="flex items-center justify-between px-4 py-1.5 text-xs text-slate-500">
                  <span>{actualSize ? "Actual size — scroll to move around" : "Fitted to the window"}</span>
                  <button type="button" onClick={() => setActualSize((v) => !v)} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                    {actualSize ? "Fit to window" : "Show actual size"}
                  </button>
                </div>
                <div className={`min-h-0 flex-1 p-3 ${actualSize ? "overflow-auto" : "flex items-center justify-center overflow-hidden"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={version}
                    src={pdfUrl(quotationId, version)}
                    alt={`Receipt for ${label}`}
                    onClick={() => setActualSize((v) => !v)}
                    className={actualSize ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in rounded object-contain shadow"}
                  />
                </div>
              </div>
            ) : (
              <iframe key={version} title={`Receipt ${label}`} src={pdfUrl(quotationId, version)} className="min-h-0 flex-1 bg-slate-100" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
