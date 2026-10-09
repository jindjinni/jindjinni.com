"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GenieLamp } from "@/components/jin/genie-lamp";
import { parseAnswer, plainText, remainingText, type Inline, type JinMessage } from "@/lib/jin-rules";
import { HOUSE_VOICE_NAMES, houseVoice, offeredVoices, pickVoice, speechChunks, spokenText, VOICE_PITCH, VOICE_RATE } from "@/lib/jin-voice";

type Shown = JinMessage & { error?: boolean };

// The browser's own speech tools (no extra service, no cost). Chrome, Edge and Safari have them; others simply don't show the buttons.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const noopSubscribe = () => () => {};

// Lets the person choose which of their device's voices Jin uses, and hear it. Shown only while reading aloud is on.
function deviceVoices(): SpeechSynthesisVoice[] {
  try {
    return "speechSynthesis" in window && typeof window.speechSynthesis.getVoices === "function" ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}
function subscribeVoices(cb: () => void) {
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  if (!synth || typeof synth.addEventListener !== "function") return () => {};
  synth.addEventListener("voiceschanged", cb);
  return () => synth.removeEventListener("voiceschanged", cb);
}
const voiceNames = () => deviceVoices().map((v) => `${v.name}|${v.lang}`).join("\n");

function VoicePicker({ onHear }: { onHear: () => void }) {
  const names = useSyncExternalStore(subscribeVoices, voiceNames, () => "");
  const lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
  const voices = names ? offeredVoices(deviceVoices(), lang) : [];
  const [chosen, setChosen] = useState(() => {
    try {
      return localStorage.getItem("jin-voice") ?? "";
    } catch {
      return "";
    }
  });
  if (voices.length < 2) return null;
  const auto = pickVoice(voices, lang)?.name ?? "";
  const usual = houseVoice(voices);
  const using = (chosen && voices.some((v) => v.name === chosen) ? chosen : auto) || "";
  const usualMissing = !usual && !(chosen && voices.some((v) => v.name === chosen));
  const choose = (name: string) => {
    setChosen(name);
    try {
      if (name) localStorage.setItem("jin-voice", name);
      else localStorage.removeItem("jin-voice");
    } catch {
      /* storage blocked: the choice lasts until the page is closed */
    }
    setTimeout(onHear, 0);
  };
  return (
    <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300" data-testid="jin-voice-picker">
    <div className="flex items-center gap-2">
      <label htmlFor="jin-voice-select" className="shrink-0 font-medium">Voice</label>
      <select
        id="jin-voice-select"
        value={using}
        onChange={(e) => choose(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
      >
        {voices.map((v) => (
          <option key={v.name} value={v.name}>{v.name}</option>
        ))}
      </select>
      <button type="button" onClick={onHear} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" data-testid="jin-voice-hear">Hear it</button>
    </div>
    {usual && using !== usual.name && (
      <p className="mt-1.5" data-testid="jin-voice-usual">
        <button type="button" onClick={() => choose("")} className="font-semibold text-emerald-700 underline dark:text-emerald-300" data-testid="jin-voice-usual-btn">Use Jin&apos;s usual voice</button> ({usual.name})
      </p>
    )}
    {usualMissing && (
      <p className="mt-1.5" data-testid="jin-voice-missing">
        Jin&apos;s usual voice ({HOUSE_VOICE_NAMES[0]}) isn&apos;t offered by this browser right now, so Jin is using {using || "the browser's own voice"}. Chrome or Edge on a computer usually has it.
      </p>
    )}
    </div>
  );
}

const MicIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const SpeakerIcon = ({ on, className = "h-5 w-5" }: { on: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="m17 9 5 6m0-6-5 6" />}
  </svg>
);

const STARTERS = ["What can you help me with?", "Where do I create a quotation?", "How is my company doing today?"];

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i}>{p.text}</strong>
        ) : p.kind === "link" ? (
          <Link key={i} href={p.href} className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100" data-testid="jin-link">
            {p.text}
          </Link>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Answer({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseAnswer(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            <InlineText parts={b.inline} />
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <InlineText parts={it} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <InlineText parts={it} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

/** Jin, the built-in helper: a lamp button in the corner that opens a small chat. The conversation lives only in this tab. */
export function JinWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Shown[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<Recognition | null>(null);
  // What this browser can do is read once on the client (the server always says no, and the panel isn't drawn until it is opened).
  const canListen = useSyncExternalStore(noopSubscribe, () => !!recognitionCtor(), () => false);
  const canSpeak = useSyncExternalStore(noopSubscribe, () => "speechSynthesis" in window, () => false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(() => {
    try {
      // Reading aloud is ON for everyone until they turn it off themselves (their choice is remembered).
      return typeof window === "undefined" || localStorage.getItem("jin-speak") !== "0";
    } catch {
      return true; // storage can be blocked; reading aloud then simply starts on
    }
  });
  const [voiceMsg, setVoiceMsg] = useState("");
  const [rated, setRated] = useState<Record<number, "UP" | "DOWN" | "sent">>({});
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      recRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const speak = useCallback((answer: string) => {
    // Reading aloud is a nicety: if the browser refuses, the written answer still stands.
    try {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const lang = navigator.language || "en-US";
      let preferred: string | null = null;
      try {
        preferred = localStorage.getItem("jin-voice");
      } catch {
        /* storage blocked: use the automatic pick */
      }
      const voice = pickVoice(deviceVoices(), lang, preferred);
      // One sentence at a time: natural pauses, and long answers are never cut off part way.
      for (const piece of speechChunks(spokenText(plainText(answer)))) {
        const u = new SpeechSynthesisUtterance(piece);
        u.lang = voice?.lang || lang;
        if (voice) u.voice = voice;
        u.rate = VOICE_RATE;
        u.pitch = VOICE_PITCH;
        synth.speak(u);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSpeak = () => {
    const next = !speakOn;
    setSpeakOn(next);
    try {
      localStorage.setItem("jin-speak", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const toggleListen = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    const before = text ? text.trimEnd() + " " : "";
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setText((before + heard).slice(0, 1500));
    };
    rec.onerror = (e) => setVoiceMsg(e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it in your browser's address bar, then try again." : e.error === "no-speech" ? "I didn't hear anything. Try again." : "Voice didn't work this time. You can type instead.");
    rec.onend = () => {
      setListening(false);
      inputRef.current?.focus();
    };
    recRef.current = rec;
    setVoiceMsg("");
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const sendFeedback = useCallback(
    async (i: number, rating: "UP" | "DOWN", noteText: string) => {
      const question = msgs[i - 1]?.content ?? "";
      const answer = msgs[i]?.content ?? "";
      setRated((r) => ({ ...r, [i]: "sent" }));
      setNoteFor(null);
      setNote("");
      try {
        await fetch("/api/jin/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating, question, answer, note: noteText }) });
      } catch {
        /* feedback is best effort */
      }
    },
    [msgs],
  );

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      const history = msgs.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      setMsgs((m) => [...m, { role: "user", content: q }]);
      setText("");
      setBusy(true);
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch("/api/jin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history }), signal: ctl.signal });
        const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string; left?: number | null };
        if (res.ok && data.answer) {
          setMsgs((m) => [...m, { role: "assistant", content: data.answer! }]);
          setLeft(typeof data.left === "number" ? data.left : null);
          if (speakOn) speak(data.answer);
        } else {
          setMsgs((m) => [...m, { role: "assistant", content: data.error ?? "I couldn't answer that just now. Please try again.", error: true }]);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setMsgs((m) => [...m, { role: "assistant", content: "I couldn't reach the platform. Check your connection and try again.", error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, speakOn, speak],
  );

  return (
    <div className="print:hidden">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-emerald-900/20 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          data-testid="jin-open"
          aria-label="Ask Jin, your helper"
        >
          <GenieLamp className="h-6 w-6" />
          Ask Jin
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label="Jin, your helper"
          className="fixed inset-x-2 bottom-2 z-40 flex max-h-[min(36rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[24rem] dark:border-emerald-900 dark:bg-slate-900"
          data-testid="jin-panel"
        >
          <header className="flex items-center justify-between gap-2 bg-emerald-700 px-4 py-2.5 text-white dark:bg-emerald-800">
            <span className="flex items-center gap-2 font-semibold">
              <GenieLamp className="h-6 w-6" />
              Jin <span className="text-xs font-normal text-emerald-100">your wish is my command</span>
            </span>
            <span className="flex items-center gap-1">
              {canSpeak && (
                <button type="button" onClick={toggleSpeak} className="rounded-md p-1.5 hover:bg-emerald-600" aria-label={speakOn ? "Stop reading answers aloud" : "Read answers aloud"} aria-pressed={speakOn} title={speakOn ? "Reading answers aloud: on" : "Read answers aloud: off"} data-testid="jin-speak">
                  <SpeakerIcon on={speakOn} />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-lg leading-none hover:bg-emerald-600" aria-label="Close Jin" data-testid="jin-close">
                ×
              </button>
            </span>
          </header>
          {canSpeak && speakOn && <VoicePicker onHear={() => speak("Hi, I'm Jin. This is how I sound.")} />}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm text-slate-800 dark:text-slate-100" data-testid="jin-messages" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p>Hi, I&apos;m Jin. Ask me how to do something in the platform, or about your company&apos;s numbers. I can look things up for you, and I&apos;ll show you the steps when you need to do something yourself.</p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900" data-testid="jin-starter">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-emerald-100 px-3 py-2 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50" data-testid="jin-user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className={`mr-4 rounded-2xl rounded-bl-sm px-3 py-2 ${m.error ? "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" : "bg-slate-100 dark:bg-slate-800"}`} data-testid={m.error ? "jin-error" : "jin-answer"}>
                  <Answer text={m.content} />
                  {!m.error && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {rated[i] === "sent" ? (
                        <span data-testid="jin-thanks">Thank you, that helps Jin learn.</span>
                      ) : (
                        <>
                          <button type="button" onClick={() => sendFeedback(i, "UP", "")} className="rounded-full border border-slate-300 px-2 py-0.5 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700" data-testid="jin-up">
                            Helpful
                          </button>
                          <button type="button" onClick={() => { setNoteFor(noteFor === i ? null : i); setNote(""); }} className="rounded-full border border-slate-300 px-2 py-0.5 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-700" data-testid="jin-down">
                            Not right
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {noteFor === i && rated[i] !== "sent" && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <label htmlFor={`jin-note-${i}`} className="text-xs text-slate-600 dark:text-slate-300">What should Jin have said? (optional) This question and answer go to the Jin team.</label>
                      <textarea id={`jin-note-${i}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900" data-testid="jin-note" />
                      <button type="button" onClick={() => sendFeedback(i, "DOWN", note)} className="self-start rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800" data-testid="jin-note-send">
                        Send to the Jin team
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="mr-4 rounded-2xl bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400" data-testid="jin-thinking">
                Jin is thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-slate-200 p-3 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor="jin-input" className="sr-only">
                Ask Jin
              </label>
              <textarea
                id="jin-input"
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                rows={2}
                maxLength={1500}
                placeholder="Ask Jin anything about the platform…"
                className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                data-testid="jin-input"
              />
              {canListen && (
                <button type="button" onClick={toggleListen} className={`rounded-lg border px-2.5 py-2 ${listening ? "animate-pulse border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"}`} aria-label={listening ? "Stop listening" : "Talk to Jin"} aria-pressed={listening} title="Talk to Jin" data-testid="jin-mic">
                  <MicIcon />
                </button>
              )}
              <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600" data-testid="jin-send">
                Send
              </button>
            </div>
            {(listening || voiceMsg) && (
              <p className={`mt-1.5 text-xs ${voiceMsg ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-300"}`} role="status" data-testid="jin-voice-status">
                {listening ? "Listening… speak now. Check what I heard, then press Send." : voiceMsg}
              </p>
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {left != null && remainingText(left) ? `${remainingText(left)} ` : ""}Jin can make mistakes. Check important numbers on the page itself.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
