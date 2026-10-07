"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { deleteMessageAction, editMessageAction, sendMessageAction, setStatusAction } from "@/app/actions/chat";
import { addRecent } from "@/lib/chat-emoji";
import {
  ATTACH_HELP,
  MAX_ATTACH_BYTES,
  MAX_MESSAGE,
  STATE_LABEL,
  dmKey,
  dmPartner,
  parseRoom,
  roomLabel,
  sortPeople,
  type ChatMessageDto,
  type ChatPersonDto,
  type ChatStatus,
  type Room,
} from "@/lib/chat-rules";
import { useLocalPref, useMounted } from "@/lib/use-local-pref";
import { Avatar, EmojiPicker, MessageRow, StatusMenu, writeRecent, type MessageActions } from "./chat-parts";

const POLL_MS = 2500;
const NO_CURSOR = "0000";

type Latest = { seq: number; room: string; from: string; preview: string } | null;
type Props = {
  me: { id: string; name: string; canModerate: boolean };
  rooms: Room[];
  initialRoom: string;
  initialPeople: ChatPersonDto[];
  initialUnread: Record<string, number>;
  initialMessages: ChatMessageDto[];
  initialHasMore: boolean;
};

const cursorOf = (list: ChatMessageDto[]) => list.reduce((m, x) => (x.changedAt > m ? x.changedAt : m), NO_CURSOR);

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function ChatApp(p: Props) {
  const mounted = useMounted();
  const [room, setRoom] = useState(p.initialRoom);
  const [people, setPeople] = useState(p.initialPeople);
  const [unread, setUnread] = useState(p.initialUnread);
  const [msgs, setMsgs] = useState(p.initialMessages);
  const [hasMore, setHasMore] = useState(p.initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sound, setSound] = useLocalPref("chat-sound", "on");

  const roomRef = useRef(room);
  const sinceRef = useRef(cursorOf(p.initialMessages));
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollNow = useRef<() => void>(() => {});
  const meRow = people.find((x) => x.isMe);

  // ---- merging what the server sends
  const merge = useCallback((incoming: ChatMessageDto[]) => {
    if (incoming.length === 0) return;
    const c = cursorOf(incoming);
    if (c > sinceRef.current) sinceRef.current = c;
    setMsgs((prev) => {
      const map = new Map(prev.map((m) => [m.seq, m]));
      for (const m of incoming) {
        const old = map.get(m.seq);
        if (!old || m.changedAt >= old.changedAt) map.set(m.seq, m);
      }
      return [...map.values()].sort((a, b) => a.seq - b.seq);
    });
  }, []);

  const noteIncoming = useCallback(
    (incoming: ChatMessageDto[]) => {
      const el = listRef.current;
      if (!el || stick.current) return;
      // Someone else wrote while this person is reading further up: don't yank the page, offer a button instead.
      if (incoming.some((m) => m.senderId !== p.me.id && !m.deleted)) setNewBelow(true);
    },
    [p.me.id],
  );

  // ---- the live refresh
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && !inflight) {
        inflight = true;
        const r0 = roomRef.current;
        try {
          const res = await fetch("/api/chat/poll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: r0, since: sinceRef.current, visible: true }), cache: "no-store" });
          if (res.status === 401) setError("You've been signed out. Refresh the page to sign in again.");
          else if (res.ok) {
            const j = (await res.json()) as { messages: ChatMessageDto[]; people: ChatPersonDto[]; unread: Record<string, number>; total: number; latest: Latest };
            if (roomRef.current === r0 && !stopped) {
              noteIncoming(j.messages.filter((m) => m.seq > (listRef.current ? Number(listRef.current.dataset.lastSeq ?? 0) : 0)));
              merge(j.messages);
              setPeople(j.people);
              setUnread(j.unread);
              setOffline(false);
              window.dispatchEvent(new CustomEvent("chat:unread", { detail: { total: j.total, latest: j.latest, newInOtherRoom: !!j.latest && j.latest.room !== r0 } }));
            }
          }
        } catch {
          setOffline(true);
        } finally {
          inflight = false;
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    pollNow.current = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    timer = setTimeout(tick, 400);
    const onVisible = () => document.visibilityState === "visible" && pollNow.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [merge, noteIncoming]);

  // ---- keep the view at the newest message (or where the person was, after loading earlier ones)
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (anchor.current) {
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    el.dataset.lastSeq = String(msgs.length ? msgs[msgs.length - 1].seq : 0);
  }, [msgs, mounted]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    if (near) setNewBelow(false);
  };

  // ---- opening a room or a private message
  const openRoom = useCallback(
    async (key: string) => {
      if (key === roomRef.current) {
        setShowList(false);
        return;
      }
      roomRef.current = key;
      setRoom(key);
      setShowList(false);
      setMsgs([]);
      setHasMore(false);
      setError(null);
      setNewBelow(false);
      setLoading(true);
      stick.current = true;
      sinceRef.current = NO_CURSOR;
      setUnread((u) => ({ ...u, [key]: 0 }));
      window.history.replaceState(null, "", `/dashboard/chat?room=${encodeURIComponent(key)}`);
      try {
        const res = await fetch("/api/chat/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: key }), cache: "no-store" });
        const j = (await res.json()) as { ok: boolean; error?: string; messages?: ChatMessageDto[]; hasMore?: boolean };
        if (roomRef.current !== key) return;
        if (!j.ok) setError(j.error ?? "That chat couldn't be opened.");
        else {
          setMsgs(j.messages ?? []);
          setHasMore(!!j.hasMore);
          sinceRef.current = cursorOf(j.messages ?? []);
        }
      } catch {
        if (roomRef.current === key) setError("That chat couldn't be opened. Check your connection and try again.");
      } finally {
        if (roomRef.current === key) setLoading(false);
      }
      pollNow.current();
    },
    [],
  );

  const showEarlier = async () => {
    const first = msgs[0];
    const el = listRef.current;
    if (!first || !el) return;
    setLoading(true);
    try {
      const res = await fetch("/api/chat/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room, before: first.seq }), cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; messages?: ChatMessageDto[]; hasMore?: boolean };
      if (j.ok && j.messages) {
        anchor.current = { height: el.scrollHeight, top: el.scrollTop };
        stick.current = false;
        setHasMore(!!j.hasMore);
        setMsgs((prev) => {
          const map = new Map(prev.map((m) => [m.seq, m]));
          for (const m of j.messages!) if (!map.has(m.seq)) map.set(m.seq, m);
          return [...map.values()].sort((a, b) => a.seq - b.seq);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // ---- sending, editing, deleting
  const grow = () => {
    const t = inputRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  };

  const send = async () => {
    if (busy) return;
    if (!text.trim() && !file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("body", text);
    if (file) fd.set("file", file);
    try {
      const r = await sendMessageAction(roomRef.current, fd);
      if (!r.ok) setError(r.error);
      else {
        setText("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        stick.current = true;
        setNewBelow(false);
        merge([r.message]);
        requestAnimationFrame(grow);
      }
    } catch {
      setError("The message couldn't be sent. Check your connection and try again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const actions: MessageActions = {
    edit: async (seq, body) => {
      try {
        const r = await editMessageAction(seq, body);
        if (!r.ok) return r.error;
        merge([r.message]);
        return null;
      } catch {
        return "That couldn't be saved. Try again.";
      }
    },
    remove: async (seq) => {
      try {
        const r = await deleteMessageAction(seq);
        if (!r.ok) return r.error;
        merge([r.message]);
        return null;
      } catch {
        return "That couldn't be deleted. Try again.";
      }
    },
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const chooseFile = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_ATTACH_BYTES) {
      setError("That file is over 4 MB. Choose a smaller one.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };
  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => chooseFile(e.target.files?.[0] ?? null);
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const f = Array.from(e.clipboardData.files)[0];
    if (f) {
      e.preventDefault();
      chooseFile(f);
    }
  };

  const insertEmoji = (e: string) => {
    const t = inputRef.current;
    const a = t?.selectionStart ?? text.length;
    const b = t?.selectionEnd ?? text.length;
    const next = text.slice(0, a) + e + text.slice(b);
    setText(next);
    const r = addRecent(recent, e);
    setRecent(r);
    writeRecent(r);
    requestAnimationFrame(() => {
      t?.focus();
      const pos = a + e.length;
      t?.setSelectionRange(pos, pos);
      grow();
    });
  };

  const toggleEmoji = () => {
    if (!emojiOpen) {
      try {
        const v = JSON.parse(window.localStorage.getItem("chat-recent-emoji") ?? "[]");
        setRecent(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
      } catch {
        setRecent([]);
      }
    }
    setEmojiOpen((o) => !o);
  };

  const saveStatus = async (status: ChatStatus, note: string): Promise<string | null> => {
    try {
      const r = await setStatusAction(status, note);
      if (!r.ok) return r.error;
      setPeople((all) => all.map((x) => (x.isMe ? { ...x, state: status, active: true, note: note.trim() ? note.trim().replace(/\s+/g, " ").slice(0, 60) : null } : x)));
      return null;
    } catch {
      return "That couldn't be saved. Try again.";
    }
  };

  // ---- what the screen shows
  const q = query.trim().toLowerCase();
  const unreadFrom = (id: string) => unread[dmKey(p.me.id, id)] ?? 0;
  const others = sortPeople(
    people.filter((x) => !x.isMe && (!q || x.name.toLowerCase().includes(q) || x.roleLabel.toLowerCase().includes(q))),
    unreadFrom,
  );
  const everyone = p.rooms.find((r) => r.kind === "everyone");
  const deptRooms = p.rooms.filter((r) => r.kind === "dept" && (!q || r.label.toLowerCase().includes(q)));
  const deptUnread = deptRooms.reduce((s, r) => s + (unread[r.key] ?? 0), 0);
  const deptForceOpen = !!q || deptUnread > 0 || parseRoom(room)?.kind === "dept";
  const onlineCount = people.filter((x) => x.state === "AVAILABLE").length;

  const partnerId = dmPartner(room, p.me.id);
  const partner = partnerId ? people.find((x) => x.id === partnerId) : undefined;
  const title = roomLabel(room, partner?.name);
  const kind = parseRoom(room)?.kind;
  const sub =
    kind === "dm" ? (partner ? `${STATE_LABEL[partner.state]}${partner.note ? ` · ${partner.note}` : ""} · ${partner.roleLabel}` : "") : kind === "everyone" ? `Everyone in the company · ${onlineCount} online` : "Department room";

  const badge = (n: number, id: string) =>
    n > 0 ? (
      <span className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white" data-testid="chat-unread" data-room={id} aria-label={`${n} unread`}>
        {n > 99 ? "99+" : n}
      </span>
    ) : null;

  const roomBtn = (r: Room) => (
    <button
      key={r.key}
      type="button"
      onClick={() => void openRoom(r.key)}
      aria-current={room === r.key ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${room === r.key ? "bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}
      data-testid="chat-room"
      data-room={r.key}
    >
      <span aria-hidden="true" className="w-4 text-center text-slate-400">{r.kind === "everyone" ? "◎" : "#"}</span>
      <span className="truncate">{r.label}</span>
      {badge(unread[r.key] ?? 0, r.key)}
    </button>
  );

  // messages, with day dividers and grouped runs from the same person
  const rows: React.ReactNode[] = [];
  let prev: ChatMessageDto | null = null;
  for (const m of msgs) {
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) {
      rows.push(
        <div key={`d${m.seq}`} className="my-3 flex items-center gap-3 text-xs text-slate-500" data-testid="chat-day">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="font-medium">{dayLabel(m.createdAt)}</span>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>,
      );
    }
    const run = !newDay && prev && prev.senderId === m.senderId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
    rows.push(<MessageRow key={m.seq} m={m} mine={m.senderId === p.me.id} showHeader={!run} showName={kind !== "dm"} canModerate={p.me.canModerate && kind !== "dm"} actions={actions} />);
    prev = m;
  }

  const fieldCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[30rem] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="chat-app">
      {/* left: me, rooms, people */}
      <aside className={`${showList ? "flex" : "hidden"} w-full shrink-0 flex-col border-slate-200 bg-slate-50 md:flex md:w-72 md:border-r dark:border-slate-800 dark:bg-slate-950`} aria-label="Chats">
        <div className="relative border-b border-slate-200 p-3 dark:border-slate-800">
          {meRow && (
            <button type="button" onClick={() => setStatusOpen((o) => !o)} data-status-toggle className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="chat-status-btn" aria-expanded={statusOpen}>
              <Avatar id={meRow.id} name={meRow.name} state={meRow.state} active={meRow.active} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{meRow.name}</span>
                <span className="block truncate text-xs text-slate-500" data-testid="chat-my-status" data-state={meRow.state}>
                  {STATE_LABEL[meRow.state]}
                  {meRow.note ? ` · ${meRow.note}` : ""} · change
                </span>
              </span>
            </button>
          )}
          {statusOpen && meRow && <StatusMenu me={meRow} onSave={saveStatus} onClose={() => setStatusOpen(false)} />}
          <label htmlFor="chat-search" className="sr-only">
            Search people and rooms
          </label>
          <input id="chat-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people and rooms" className={`${fieldCls} mt-2`} data-testid="chat-search" />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms</p>
          {everyone && (!q || everyone.label.toLowerCase().includes(q)) && roomBtn(everyone)}
          {deptRooms.length > 0 && (
            <details key={String(deptForceOpen)} open={deptForceOpen} className="mt-0.5" data-testid="chat-dept-group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <span aria-hidden="true" className="w-4 text-center text-slate-400">▸</span>
                <span>Departments ({deptRooms.length})</span>
                {badge(deptUnread, "departments")}
              </summary>
              <div className="ml-3 border-l border-slate-200 pl-1 dark:border-slate-800">{deptRooms.map(roomBtn)}</div>
            </details>
          )}
          <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            People ({others.length}) · {onlineCount} online
          </p>
          {others.length === 0 && <p className="px-2.5 py-2 text-sm text-slate-500">{q ? "No one matches that." : "No one else is in your company yet."}</p>}
          {others.map((x) => {
            const key = dmKey(p.me.id, x.id);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => void openRoom(key)}
                aria-current={room === key ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${room === key ? "bg-emerald-100 dark:bg-emerald-950" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                data-testid="chat-person"
                data-user={x.id}
                data-state={x.state}
              >
                <Avatar id={x.id} name={x.name} state={x.state} active={x.active} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${unreadFrom(x.id) > 0 ? "font-bold" : "font-medium"} text-slate-900 dark:text-slate-50`}>{x.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {STATE_LABEL[x.state]}
                    {x.note ? ` · ${x.note}` : ` · ${x.roleLabel}`}
                  </span>
                </span>
                {badge(unreadFrom(x.id), key)}
              </button>
            );
          })}
        </div>
      </aside>

      {/* right: the conversation */}
      <section className={`${showList ? "hidden" : "flex"} min-w-0 flex-1 flex-col md:flex`} aria-label="Conversation">
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <button type="button" onClick={() => setShowList(true)} className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden dark:border-slate-700" data-testid="chat-back">
            ← Chats
          </button>
          {partner && <Avatar id={partner.id} name={partner.name} state={partner.state} active={partner.active} />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50" data-testid="chat-title">
              {kind === "dm" ? title : kind === "everyone" ? "Everyone" : `${title} room`}
            </h1>
            <p className="truncate text-xs text-slate-500" data-testid="chat-sub">
              {sub}
            </p>
          </div>
          <button type="button" onClick={() => setSound(sound === "off" ? "on" : "off")} className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-pressed={sound !== "off"} title="Play a sound when a message arrives while you're on another page" data-testid="chat-sound">
            {sound === "off" ? "🔕 Sound off" : "🔔 Sound on"}
          </button>
        </header>

        {offline && (
          <p className="bg-yellow-50 px-4 py-1.5 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200" role="status" data-testid="chat-offline">
            Can&apos;t reach the server. Trying again...
          </p>
        )}

        <div className="relative min-h-0 flex-1">
          <div ref={listRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Messages" data-testid="chat-list">
            {!mounted ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading messages...</p>
            ) : (
              <>
                {hasMore && (
                  <div className="mb-2 text-center">
                    <button type="button" disabled={loading} onClick={showEarlier} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" data-testid="chat-more">
                      Show earlier messages
                    </button>
                  </div>
                )}
                {loading && msgs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Loading messages...</p>}
                {!loading && msgs.length === 0 && (
                  <p className="py-10 text-center text-sm text-slate-500" data-testid="chat-empty">
                    {kind === "dm" ? `No messages yet. Say hello to ${title}.` : "No messages yet. Be the first to say something."}
                  </p>
                )}
                {rows}
              </>
            )}
          </div>
          {newBelow && (
            <button
              type="button"
              onClick={() => {
                stick.current = true;
                setNewBelow(false);
                const el = listRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
              data-testid="chat-newpill"
            >
              New messages ↓
            </button>
          )}
        </div>

        {/* composer */}
        <div className="relative border-t border-slate-200 p-3 dark:border-slate-800">
          {error && (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" data-testid="chat-error">
              {error}
            </p>
          )}
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-800" data-testid="chat-file-chip">
              <span aria-hidden="true">📎</span>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="rounded px-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="Remove file" data-testid="chat-file-remove">
                ✕
              </button>
            </div>
          )}
          {emojiOpen && <EmojiPicker recent={recent} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
          <div className="flex items-end gap-2">
            <button type="button" data-emoji-toggle onClick={toggleEmoji} aria-expanded={emojiOpen} aria-label="Add emoji" title="Emoji" className="rounded-lg px-2 py-1.5 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="chat-emoji-btn">
              😊
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a photo or file" title={ATTACH_HELP} className="rounded-lg px-2 py-1.5 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="chat-attach">
              📎
            </button>
            <input ref={fileRef} id="chat-file" type="file" className="sr-only" tabIndex={-1} accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.docx,.xlsx" onChange={onPickFile} data-testid="chat-file-input" />
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              value={text}
              rows={1}
              maxLength={MAX_MESSAGE + 200}
              onChange={(e) => {
                setText(e.target.value);
                grow();
              }}
              onKeyDown={onKey}
              onPaste={onPaste}
              placeholder={kind === "dm" ? `Message ${title}` : `Message ${kind === "everyone" ? "everyone" : title}`}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              data-testid="chat-input"
            />
            <button type="button" onClick={() => void send()} disabled={busy || (!text.trim() && !file)} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" data-testid="chat-send">
              Send
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Enter to send · Shift+Enter for a new line{text.length > MAX_MESSAGE - 200 ? ` · ${text.length}/${MAX_MESSAGE}` : ""}</p>
        </div>
      </section>
    </div>
  );
}
