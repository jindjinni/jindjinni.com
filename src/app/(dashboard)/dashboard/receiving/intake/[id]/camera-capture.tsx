"use client";

// Live camera for receiving photos: opens the camera attached to this computer or phone (a webcam, a USB document camera,
// the phone's back camera), shows the picture, and turns a click into a photo. Nothing is sent anywhere until the caller
// uploads the file it is given. "Choose a file" stays available next to this wherever photos are added.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type Cam = { id: string; label: string };

export const cameraSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const noSubscribe = () => () => undefined;
/** True in the browser when a camera can be opened; false on the server and in browsers without one. */
export const useCameraSupported = () => useSyncExternalStore(noSubscribe, cameraSupported, () => false);
const useMounted = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export function CameraCapture({
  title = "Take a photo",
  onCapture,
  onClose,
  multiple = true,
  highRes = false,
}: {
  title?: string;
  /** Called with each photo as a JPEG file. May return a promise; the camera waits for it before the next shot. Return false when the photo could not be saved. */
  onCapture: (file: File) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  /** Keep the camera open for more photos (default). When false the camera closes after the first photo. */
  multiple?: boolean;
  /** Ask the camera for 4K and keep the full picture (for group photos whose small print must stay readable). */
  highRes?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cams, setCams] = useState<Cam[]>([]);
  const [camId, setCamId] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(0);
  const [size, setSize] = useState("");
  const mounted = useMounted();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (deviceId: string) => {
      stop();
      if (!cameraSupported()) {
        setError("This browser can't open a camera. Use Choose a file instead.");
        return;
      }
      try {
        const video: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: highRes ? 3840 : 1920 }, height: { ideal: highRes ? 2160 : 1080 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: highRes ? 3840 : 1920 }, height: { ideal: highRes ? 2160 : 1080 } };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        // Names only appear once the camera has been allowed.
        const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        setCams(all.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
        const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (active) setCamId(active);
        const st = stream.getVideoTracks()[0]?.getSettings();
        if (st?.width && st?.height) setSize(`${st.width} × ${st.height}`);
        setReady(true);
      } catch (e) {
        const denied = e instanceof Error && /denied|permission|notallowed/i.test(`${e.name} ${e.message}`);
        const none = e instanceof Error && /notfound|devicesnotfound|overconstrained/i.test(`${e.name} ${e.message}`);
        setError(
          denied
            ? "Camera access was blocked. Allow the camera for this site in the browser's address bar, then try again."
            : none
              ? "No camera was found on this computer. Plug one in, or use Choose a file."
              : "Couldn't start the camera. Close other programs that may be using it, or use Choose a file.",
        );
      }
    },
    [stop, highRes],
  );

  useEffect(() => {
    const t = setTimeout(() => void start(""), 0);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [start, stop]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function snap() {
    const v = videoRef.current;
    if (!v || !ready || busy || !v.videoWidth) return;
    setBusy(true);
    try {
      const scale = Math.min(1, (highRes ? 4096 : 2200) / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", highRes ? 0.93 : 0.88));
      if (!blob) {
        setError("Couldn't take that photo. Try again.");
        return;
      }
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const saved = await onCapture(new File([blob], `camera-${stamp}.jpg`, { type: "image/jpeg" }));
      if (saved === false) {
        setError("That photo couldn't be saved. Check the message on the page, then take it again.");
        return;
      }
      setError("");
      setTaken((n) => n + 1);
      if (!multiple) closeRef.current();
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            {taken > 0 ? "Done" : "Close"}
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-black">
          <video ref={videoRef} className="mx-auto max-h-[60vh] w-full object-contain" muted playsInline aria-label="Live camera picture" />
          {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">Starting the camera…</p>}
        </div>
        {error && <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={snap}
            disabled={!ready || busy}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {busy ? "Saving…" : "Take photo"}
          </button>
          {cams.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              Camera
              <select
                className="max-w-[14rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={camId}
                onChange={(e) => {
                  setCamId(e.target.value);
                  setReady(false);
                  setError("");
                  void start(e.target.value);
                }}
              >
                {cams.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {taken > 0 && <span role="status" className="text-sm font-medium text-green-700 dark:text-green-400">{taken} photo{taken === 1 ? "" : "s"} added</span>}
          <span className="basis-full text-xs text-slate-500">{highRes && size ? `Camera is giving ${size}.${/^(3840|4096)/.test(size) ? "" : " That is below 4K: small print may not read well. Try another camera, or use the phone's own camera button."} ` : ""}Keep patient names and pharmacy stickers out of the picture.</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
