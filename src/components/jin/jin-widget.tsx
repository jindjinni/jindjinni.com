"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GenieLamp } from "@/components/jin/genie-lamp";
import { parseAnswer, remainingText, type Inline, type JinMessage } from "@/lib/jin-rules";

type Shown = JinMessage & { error?: boolean };

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

  useEffect(() => () => abortRef.current?.abort(), []);

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
        } else {
          setMsgs((m) => [...m, { role: "assistant", content: data.error ?? "I couldn't answer that just now. Please try again.", error: true }]);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setMsgs((m) => [...m, { role: "assistant", content: "I couldn't reach the platform. Check your connection and try again.", error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs],
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
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-lg leading-none hover:bg-emerald-600" aria-label="Close Jin" data-testid="jin-close">
              ×
            </button>
          </header>
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
              <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600" data-testid="jin-send">
                Send
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {left != null && remainingText(left) ? `${remainingText(left)} ` : ""}Jin can make mistakes. Check important numbers on the page itself.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
