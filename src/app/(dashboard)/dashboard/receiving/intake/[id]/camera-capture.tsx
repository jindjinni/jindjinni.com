"use client";

// Live camera for receiving photos: opens the camera attached to this computer or phone (a webcam, a USB document camera,
// the phone's back camera), shows a large picture, and turns a click into a photo. Nothing is sent anywhere until the caller
// uploads the file it is given. "Choose a file" stays available next to this wherever photos are added.
//
// Sharpness: the camera is asked for the biggest picture it can give (up to 8K) and, where the browser allows it, the photo
// is taken with the camera's own still-photo mode (full sensor size, better than a frame cut from the video). Focus and
// exposure are kept on automatic and can be re-triggered. Because each saved photo may be at most 4 MB, a big photo is saved
// at the largest size that fits (see fitImageToBytes); callers that don't upload the photo can ask for it untouched.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { fitImageToBytes, MAX_PIXELS, resolutionLabel } from "@/lib/client-image";

type Cam = { id: string; label: string };
type Quality = "max" | "4k" | "hd";

const QUALITY: Record<Quality, { label: string; w: number; h: number }> = {
  max: { label: "Highest the camera can do (up to 8K)", w: 7680, h: 4320 },
  "4k": { label: "4K", w: 3840, h: 2160 },
  hd: { label: "Full HD", w: 1920, h: 1080 },
};

export const cameraSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const noSubscribe = () => () => undefined;
/** True in the browser when a camera can be opened; false on the server and in browsers without one. */
export const useCameraSupported = () => useSyncExternalStore(noSubscribe, cameraSupported, () => false);
const useMounted = () => useSyncExternalStore(noSubscribe, () => true, () => false);

// Camera controls the standard typings don't list yet.
type FancyCaps = MediaTrackCapabilities & { focusMode?: string[]; exposureMode?: string[]; whiteBalanceMode?: string[] };
const advanced = (c: Record<string, string>) => ({ advanced: [c] }) as unknown as MediaTrackConstraints;

type StillCamera = {
  getPhotoCapabilities(): Promise<{ imageWidth?: { max: number }; imageHeight?: { max: number } }>;
  takePhoto(settings?: Record<string, unknown>): Promise<Blob>;
};
const stillCameraFor = (track: MediaStreamTrack): StillCamera | null => {
  const Ctor = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => StillCamera }).ImageCapture;
  return Ctor ? new Ctor(track) : null;
};

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function CameraCapture({
  title = "Take a photo",
  onCapture,
  onClose,
  multiple = true,
  fitToUpload = true,
}: {
  title?: string;
  /** Called with each photo as a JPEG file. May return a promise; the camera waits for it before the next shot. Return false when the photo could not be saved. */
  onCapture: (file: File) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  /** Keep the camera open for more photos (default). When false the camera closes after the first photo. */
  multiple?: boolean;
  /** Save each photo at the largest size that fits the 4 MB upload limit (default). Pass false when the photo is only read on this computer and never uploaded: it then keeps the camera's full size. */
  fitToUpload?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cams, setCams] = useState<Cam[]>([]);
  const [camId, setCamId] = useState("");
  const [quality, setQuality] = useState<Quality>("max");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [canRefocus, setCanRefocus] = useState(false);
  const [last, setLast] = useState<{ url: string; w: number; h: number; bytes: number } | null>(null);
  const mounted = useMounted();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const lastUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (deviceId: string, q: Quality) => {
      stop();
      if (!cameraSupported()) {
        setError("This browser can't open a camera. Use Choose a file instead.");
        return;
      }
      try {
        const want = QUALITY[q];
        const size = { width: { ideal: want.w }, height: { ideal: want.h }, resizeMode: "none" } as MediaTrackConstraints;
        const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: "environment" }, ...size };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        // Keep focus, exposure and white balance on automatic so the picture is sharp and evenly lit.
        const caps = (track?.getCapabilities?.() ?? {}) as FancyCaps;
        for (const [key, modes] of [["focusMode", caps.focusMode], ["exposureMode", caps.exposureMode], ["whiteBalanceMode", caps.whiteBalanceMode]] as const) {
          if (modes?.includes("continuous")) await track.applyConstraints(advanced({ [key]: "continuous" })).catch(() => undefined);
        }
        setCanRefocus(!!caps.focusMode?.includes("single-shot") && !!caps.focusMode?.includes("continuous"));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        // Names only appear once the camera has been allowed.
        const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        setCams(all.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
        const st = track?.getSettings();
        if (st?.deviceId) setCamId(st.deviceId);
        if (st?.width && st?.height) setDims({ w: st.width, h: st.height });
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
    [stop],
  );

  useEffect(() => {
    const t = setTimeout(() => void start("", quality), 0);
    return () => {
      clearTimeout(t);
      stop();
    };
    // The camera restarts only when the quality is changed on purpose (see the picker); the first start is here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Asks the camera to focus again (for cameras with their own focus), then goes back to automatic focus. */
  async function refocus() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints(advanced({ focusMode: "single-shot" })).catch(() => undefined);
    setTimeout(() => void track.applyConstraints(advanced({ focusMode: "continuous" })).catch(() => undefined), 1200);
  }

  /** The camera's own still photo at its biggest size, when the browser can do it and it beats the video picture. */
  async function stillPhoto(track: MediaStreamTrack | undefined, videoPixels: number): Promise<Blob | null> {
    if (!track) return null;
    try {
      const still = stillCameraFor(track);
      if (!still) return null;
      const pc = await still.getPhotoCapabilities().catch(() => null);
      const settings: Record<string, unknown> = { fillLightMode: "off" };
      if (pc?.imageWidth?.max && pc?.imageHeight?.max) {
        settings.imageWidth = pc.imageWidth.max;
        settings.imageHeight = pc.imageHeight.max;
      }
      const blob = await still.takePhoto(settings);
      const bmp = await createImageBitmap(blob);
      const pixels = bmp.width * bmp.height;
      bmp.close?.();
      return pixels >= videoPixels ? blob : null;
    } catch {
      return null;
    }
  }

  async function snap() {
    const v = videoRef.current;
    if (!v || !ready || busy || !v.videoWidth) return;
    setBusy(true);
    try {
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const name = `camera-${stamp}.jpg`;
      const track = streamRef.current?.getVideoTracks()[0];
      const still = await stillPhoto(track, v.videoWidth * v.videoHeight);
      let file: File | null = null;
      if (still) {
        file = fitToUpload ? await fitImageToBytes(still, name) : new File([still], name, { type: still.type || "image/jpeg" });
      } else {
        // A frame of the live picture, at the size the camera is giving.
        const frame = await createImageBitmap(v);
        try {
          if (fitToUpload) file = await fitImageToBytes(frame, name);
          else {
            const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (frame.width * frame.height)));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(frame.width * scale);
            canvas.height = Math.round(frame.height * scale);
            canvas.getContext("2d")?.drawImage(frame, 0, 0, canvas.width, canvas.height);
            const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.95));
            if (blob) file = new File([blob], name, { type: "image/jpeg" });
          }
        } finally {
          frame.close?.();
        }
      }
      if (!file) {
        setError("Couldn't take that photo. Try again.");
        return;
      }
      const preview = await createImageBitmap(file).catch(() => null);
      const saved = await onCapture(file);
      if (saved === false) {
        setError("That photo couldn't be saved. Check the message on the page, then take it again.");
        preview?.close?.();
        return;
      }
      if (preview) {
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = URL.createObjectURL(file);
        setLast({ url: lastUrl.current, w: preview.width, h: preview.height, bytes: file.size });
        preview.close?.();
      }
      setError("");
      setTaken((n) => n + 1);
      if (!multiple) closeRef.current();
    } finally {
      setBusy(false);
    }
  }

  const longSide = dims ? Math.max(dims.w, dims.h) : 0;
  const below4k = quality === "max" && dims && longSide < 3700;

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={title} data-testid="camera-window">
      <div className="flex h-[96vh] w-[98vw] max-w-[110rem] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            {taken > 0 ? "Done" : "Close"}
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" muted playsInline aria-label="Live camera picture" data-testid="camera-video" />
          {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">Starting the camera…</p>}
          {dims && ready && (
            <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white" data-testid="camera-size">
              {dims.w} × {dims.h} · {resolutionLabel(dims.w, dims.h)}
            </span>
          )}
          {last && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/60 p-1.5 pr-3 text-xs text-white" data-testid="camera-last">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={last.url} alt="The last photo taken" className="h-14 w-20 rounded object-cover" />
              <span>
                Last photo
                <br />
                {last.w} × {last.h} · {mb(last.bytes)}
              </span>
            </div>
          )}
        </div>
        {error && <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={snap}
            disabled={!ready || busy}
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {busy ? "Saving…" : "Take photo"}
          </button>
          {canRefocus && (
            <button type="button" onClick={() => void refocus()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
              Focus again
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Picture size
            <select
              className="max-w-[16rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={quality}
              data-testid="camera-quality"
              onChange={(e) => {
                const q = e.target.value as Quality;
                setQuality(q);
                setReady(false);
                setError("");
                void start(camId, q);
              }}
            >
              {(Object.keys(QUALITY) as Quality[]).map((k) => (
                <option key={k} value={k}>
                  {QUALITY[k].label}
                </option>
              ))}
            </select>
          </label>
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
                  void start(e.target.value, quality);
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
          <span className="basis-full text-xs text-slate-500">
            {below4k
              ? `The camera is giving ${dims?.w} × ${dims?.h}. If it is a 4K camera, plug it into a USB 3 port (blue) with the cable it came with, close other programs using it, and pick it in the Camera list. Small print reads best at 4K. `
              : ""}
            {fitToUpload ? "Each photo is saved at the biggest size that fits 4 MB. " : ""}Keep patient names and pharmacy stickers out of the picture.
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
