"use client";

// Camera / photo capture for lot and serial numbers. Used by the Recall check box and by the scan button on each
// product row. Barcodes and QR codes are read in the browser (nothing is sent anywhere); a photo with no barcode is
// read for its text by the server when photo reading is switched on.

import { useEffect, useRef, useState } from "react";
import { readRecallPhoto } from "@/app/actions/receiving-recalls";
import { parseGs1 } from "@/lib/receiving-recall";

export const scanBtn =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";

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

async function readers() {
  const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

export function ScanTools({
  disabled,
  photoReading,
  onText,
  onError,
  autoStart,
  idPrefix = "scan",
}: {
  disabled?: boolean;
  photoReading: boolean;
  /** Called with the text of a barcode / QR code, or the numbers read from a photo. */
  onText: (text: string) => void;
  onError: (m: string) => void;
  /** Opens the camera as soon as this appears. */
  autoStart?: boolean;
  idPrefix?: string;
}) {
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => () => stopRef.current?.(), []);

  async function startScan() {
    setMsg("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg("This browser can't open the camera. Use Take a photo or type the number.");
      return;
    }
    setScanning(true);
    try {
      const reader = await readers();
      await new Promise((r) => setTimeout(r, 50)); // the video element has to be on the page
      if (!videoRef.current) return;
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result, _err, c) => {
        if (result) {
          c.stop();
          stopRef.current = null;
          setScanning(false);
          onTextRef.current(result.getText());
        }
      });
      stopRef.current = () => controls.stop();
    } catch (e) {
      setScanning(false);
      const denied = e instanceof Error && /denied|permission|notallowed/i.test(`${e.name} ${e.message}`);
      setMsg(denied ? "Camera access was blocked. Allow the camera for this site in the browser, or use Take a photo." : "Couldn't start the camera. Use Take a photo or type the number.");
    }
  }
  function stopScan() {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  }

  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void startScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setMsg("Reading the photo…");
    // First look for a barcode in the picture (free, nothing uploaded); then ask the photo reader.
    try {
      const url = URL.createObjectURL(file);
      try {
        const res = await (await readers()).decodeFromImageUrl(url);
        setMsg("");
        onTextRef.current(res.getText());
        return;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      /* no barcode found: fall through to the photo reader */
    }
    if (!photoReading) {
      setMsg("No barcode found in that photo. Type the number, or ask an admin to switch on photo reading.");
      return;
    }
    const fd = new FormData();
    fd.set("photo", await shrinkPhoto(file));
    const r = await readRecallPhoto(fd);
    if (r.error || !r.label) {
      setMsg("");
      onError(r.error ?? "Couldn't read that photo.");
      return;
    }
    const l = r.label;
    setMsg(`Read from the photo: ${[l.lot && `lot ${l.lot}`, l.serial && `serial ${l.serial}`].filter(Boolean).join(", ")}. Check it matches the label.`);
    onTextRef.current(l.barcodeText && parseGs1(l.barcodeText) ? l.barcodeText : [l.lot, l.serial].filter(Boolean).join(" "));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={scanBtn} disabled={disabled || scanning} onClick={startScan}>
          <span aria-hidden>▣</span> Scan barcode with camera
        </button>
        <button type="button" className={scanBtn} disabled={disabled} onClick={() => photoRef.current?.click()}>
          <span aria-hidden>◉</span> Take or choose a photo of the label
        </button>
        <input
          ref={photoRef}
          id={`${idPrefix}-photo`}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label="Photo of the label"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void onPhoto(f);
          }}
        />
        <span className="text-xs text-slate-500">{photoReading ? "If there is no barcode, the label text is read for the lot and serial number." : "Photos work for barcodes and QR codes."}</span>
      </div>
      <p className="mt-2 max-w-3xl rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
        <strong>Photo tip:</strong> frame only the side of the box or product with the lot number, serial number or barcode. Keep pharmacy stickers and anything with a patient&apos;s name out of the picture.
        {photoReading ? " If no barcode is found, the photo is sent to an outside reading service (Anthropic) to pick out the numbers. This app does not store it, but the service may keep it for a short time." : ""}
      </p>
      {msg && (
        <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          {msg}
        </p>
      )}
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
    </div>
  );
}
