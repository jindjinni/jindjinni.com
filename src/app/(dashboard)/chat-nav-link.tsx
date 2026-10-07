"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { tabTitle } from "@/lib/chat-rules";
import { playChime } from "@/lib/chat-sound";
import { useLocalPref } from "@/lib/use-local-pref";

type Latest = { seq: number; room: string; from: string; preview: string } | null;

/** The "Chat" link in the top bar: a red count of unread messages, a soft chime and a small pop-up when something new arrives. */
export function ChatNavLink({ active }: { active: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const onChat = pathname === "/dashboard/chat" || pathname.startsWith("/dashboard/chat/");
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState<{ room: string; from: string; preview: string } | null>(null);
  const [sound] = useLocalPref("chat-sound", "on");
  const soundRef = useRef(sound);
  const lastSeq = useRef<number | null>(null);
  const baseTitle = useRef("");

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // New-message handling, shared by this bar's own refresh and by the chat screen (which refreshes faster while it is open).
  useEffect(() => {
    const onNew = (latest: Latest, count: number, fromChatScreen: boolean) => {
      setTotal(count);
      if (lastSeq.current === null) {
        lastSeq.current = latest?.seq ?? 0; // what was already waiting when the page opened isn't "new"
        return;
      }
      if (latest && latest.seq > lastSeq.current) {
        lastSeq.current = latest.seq;
        if (!fromChatScreen) {
          if (soundRef.current !== "off") playChime();
          setToast({ room: latest.room, from: latest.from, preview: latest.preview });
        }
      }
    };
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ total: number; latest: Latest; newInOtherRoom: boolean }>).detail;
      setTotal(d.total);
      if (lastSeq.current === null) {
        lastSeq.current = d.latest?.seq ?? 0;
        return;
      }
      if (d.latest && d.latest.seq > lastSeq.current) {
        lastSeq.current = d.latest.seq;
        if (d.newInOtherRoom) {
          if (soundRef.current !== "off") playChime();
          setToast({ room: d.latest.room, from: d.latest.from, preview: d.latest.preview });
        }
      }
    };
    window.addEventListener("chat:unread", handler);

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (stopped) return;
      // The open chat screen keeps this up to date (and the person is online) itself, so only the other pages ask.
      if (!onChat && document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/chat/summary", { cache: "no-store" });
          if (res.ok) {
            const j = (await res.json()) as { total: number; latest: Latest };
            onNew(j.latest, j.total, false);
          }
        } catch {
          /* offline for a moment: try again next time */
        }
      }
      if (!stopped) timer = setTimeout(refresh, 8000);
    };
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !onChat) {
        if (timer) clearTimeout(timer);
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("chat:unread", handler);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onChat]);

  // The browser tab says "(3) ..." while there is something unread.
  useEffect(() => {
    baseTitle.current = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = tabTitle(total, baseTitle.current);
    return () => {
      document.title = baseTitle.current;
    };
  }, [total, pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <Link
        href="/dashboard/chat"
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors ${
          active
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-300 dark:hover:bg-emerald-950 dark:hover:text-emerald-200"
        }`}
        data-testid="chat-nav"
      >
        Chat
        {total > 0 && (
          <span className="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white" data-testid="chat-badge" aria-label={`${total} unread messages`}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </Link>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs print:hidden" role="status" data-testid="chat-toast">
          <button
            type="button"
            onClick={() => {
              router.push(`/dashboard/chat?room=${encodeURIComponent(toast.room)}`);
              setToast(null);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-sm shadow-lg hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <span className="block font-semibold text-slate-900 dark:text-slate-50">{toast.from}</span>
            <span className="block truncate text-slate-600 dark:text-slate-300">{toast.preview}</span>
          </button>
        </div>
      )}
    </>
  );
}
