"use client";

import { useEffect, useRef, useState } from "react";
import { EMOJI_GROUPS, RECENT_KEY, RECENT_MAX, searchEmoji } from "@/lib/chat-emoji";
import { MAX_NOTE, STATE_LABEL, STATUS_CHOICES, initials, linkify, type ChatMessageDto, type ChatPersonDto, type ChatState, type ChatStatus } from "@/lib/chat-rules";

// ---------------------------------------------------------------------------
// Status dot and avatar. Status colors are fixed (the company theme repaints emerald/amber, so those aren't used for meaning).
// ---------------------------------------------------------------------------

const DOT: Record<ChatState, string> = {
  AVAILABLE: "bg-green-500",
  BUSY: "bg-red-500",
  LUNCH: "bg-yellow-500",
  AWAY: "bg-sky-400",
  OUT_OF_OFFICE: "bg-violet-500",
  OFFLINE: "bg-slate-400",
};

export function StatusDot({ state, active, className = "" }: { state: ChatState; active: boolean; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[state]} ${!active && state !== "OFFLINE" ? "opacity-50" : ""} ${className}`}
      title={STATE_LABEL[state]}
      aria-hidden="true"
      data-testid="chat-dot"
      data-state={state}
    />
  );
}

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
];

function toneFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({ id, name, state, active }: { id: string; name: string; state?: ChatState; active?: boolean }) {
  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${toneFor(id)}`}>{initials(name)}</span>
      {state && <StatusDot state={state} active={active ?? true} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-slate-900" />}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Emoji picker
// ---------------------------------------------------------------------------

export function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* blocked storage: recents just don't stick */
  }
}

export function EmojiPicker({ onPick, onClose, recent }: { onPick: (e: string) => void; onClose: () => void; recent: string[] }) {
  const [group, setGroup] = useState(recent.length ? "recent" : EMOJI_GROUPS[0].id);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (box.current && t && !box.current.contains(t) && !t.closest("[data-emoji-toggle]")) onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const found = q.trim() ? searchEmoji(q) : null;
  const items = found ? found.map((m) => m.e) : group === "recent" ? recent : (EMOJI_GROUPS.find((g) => g.id === group)?.items.map((m) => m.e) ?? []);

  return (
    <div ref={box} className="absolute bottom-full left-0 z-20 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900" data-testid="chat-emoji-picker" role="dialog" aria-label="Emoji">
      <input
        id="chat-emoji-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search emoji (heart, coffee, thumbs...)"
        className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        data-testid="chat-emoji-search"
        autoFocus
      />
      {!found && (
        <div className="mb-1 flex gap-1 border-b border-slate-100 pb-1 dark:border-slate-800" role="tablist">
          {recent.length > 0 && (
            <button type="button" role="tab" aria-selected={group === "recent"} title="Recently used" onClick={() => setGroup("recent")} className={`rounded-md px-2 py-1 text-base ${group === "recent" ? "bg-emerald-100 dark:bg-emerald-950" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`} data-testid="chat-emoji-tab-recent">
              🕘
            </button>
          )}
          {EMOJI_GROUPS.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={group === g.id} title={g.label} onClick={() => setGroup(g.id)} className={`rounded-md px-2 py-1 text-base ${group === g.id ? "bg-emerald-100 dark:bg-emerald-950" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`} data-testid={`chat-emoji-tab-${g.id}`}>
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
        {items.length === 0 ? (
          <p className="col-span-8 px-1 py-3 text-center text-sm text-slate-500">No emoji match that.</p>
        ) : (
          items.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)} className="rounded-md p-1 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="chat-emoji" data-e={e} aria-label={e}>
              {e}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status picker
// ---------------------------------------------------------------------------

export function StatusMenu({ me, onSave, onClose }: { me: ChatPersonDto; onSave: (status: ChatStatus, note: string) => Promise<string | null>; onClose: () => void }) {
  const current: ChatStatus = me.state === "OFFLINE" ? "AVAILABLE" : me.state;
  const [status, setStatus] = useState<ChatStatus>(current);
  const [note, setNote] = useState(me.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (box.current && t && !box.current.contains(t) && !t.closest("[data-status-toggle]")) onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const e = await onSave(status, note);
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  };

  return (
    <div ref={box} className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900" data-testid="chat-status-menu" role="dialog" aria-label="Set your status">
      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Your status</legend>
        <div className="space-y-0.5">
          {STATUS_CHOICES.map((c) => (
            <label key={c.value} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${status === c.value ? "bg-emerald-50 dark:bg-emerald-950/60" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
              <input type="radio" name="chat-status" value={c.value} checked={status === c.value} onChange={() => setStatus(c.value)} className="sr-only" data-testid={`chat-status-opt-${c.value}`} />
              <StatusDot state={c.value} active />
              <span className="font-medium text-slate-900 dark:text-slate-50">{c.label}</span>
              <span className="truncate text-xs text-slate-500">{c.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="chat-status-note" className="mt-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
        Note (optional)
      </label>
      <input id="chat-status-note" value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} placeholder="Back at 2pm" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" data-testid="chat-status-note" />
      {err && (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
          {err}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" data-testid="chat-status-save">
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One message
// ---------------------------------------------------------------------------

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Body({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((s, i) =>
        s.href ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function fmtSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export type MessageActions = { edit: (seq: number, body: string) => Promise<string | null>; remove: (seq: number) => Promise<string | null> };

export function MessageRow({ m, mine, showHeader, showName, canModerate, actions }: { m: ChatMessageDto; mine: boolean; showHeader: boolean; showName: boolean; canModerate: boolean; actions: MessageActions }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = mine && !m.deleted;
  const canDelete = !m.deleted && (mine || canModerate);

  const saveEdit = async () => {
    setBusy(true);
    setErr(null);
    const e = await actions.edit(m.seq, draft);
    setBusy(false);
    if (e) setErr(e);
    else setEditing(false);
  };
  const doDelete = async () => {
    setBusy(true);
    const e = await actions.remove(m.seq);
    setBusy(false);
    if (e) setErr(e);
    setConfirm(false);
  };

  return (
    <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""} ${showHeader ? "mt-3" : "mt-0.5"}`} data-testid="chat-msg" data-seq={m.seq} data-mine={mine ? "1" : "0"} data-deleted={m.deleted ? "1" : "0"}>
      {!mine && (showHeader ? <Avatar id={m.senderId} name={m.senderName} /> : <span className="w-9 shrink-0" aria-hidden="true" />)}
      <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {showHeader && !mine && showName && <span className="mb-0.5 px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{m.senderName}</span>}
        <div className="flex items-center gap-1.5">
          {mine || canModerate ? (
            <div className={`flex gap-1 text-xs opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${mine ? "order-first" : "order-last"}`}>
              {canEdit && !editing && (
                <button type="button" onClick={() => { setDraft(m.body); setEditing(true); }} className="rounded px-1.5 py-0.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800" data-testid="chat-edit">
                  Edit
                </button>
              )}
              {canDelete && !confirm && (
                <button type="button" onClick={() => setConfirm(true)} className="rounded px-1.5 py-0.5 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950" data-testid="chat-delete">
                  Delete
                </button>
              )}
            </div>
          ) : null}
          <div
            className={`rounded-2xl px-3 py-1.5 text-sm ${
              m.deleted
                ? "border border-dashed border-slate-300 italic text-slate-500 dark:border-slate-700"
                : mine
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
            }`}
          >
            {m.deleted ? (
              "This message was deleted."
            ) : editing ? (
              <div className="min-w-[14rem]">
                <textarea
                  id={`chat-edit-${m.seq}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void saveEdit();
                    }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  rows={2}
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                  data-testid="chat-edit-input"
                />
                <div className="mt-1 flex justify-end gap-1.5 text-xs">
                  <button type="button" onClick={() => setEditing(false)} className="rounded bg-white/20 px-2 py-1 font-medium hover:bg-white/30">
                    Cancel
                  </button>
                  <button type="button" disabled={busy} onClick={saveEdit} className="rounded bg-white px-2 py-1 font-semibold text-emerald-800 disabled:opacity-60" data-testid="chat-edit-save">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                {m.attachment &&
                  (m.attachment.isImage ? (
                    <a href={`/api/chat/files/${m.attachment.id}`} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, signed-in route; next/image can't fetch it */}
                      <img src={`/api/chat/files/${m.attachment.id}`} alt={m.attachment.filename} loading="lazy" className="max-h-60 max-w-full rounded-lg" data-testid="chat-image" />
                    </a>
                  ) : (
                    <a href={`/api/chat/files/${m.attachment.id}`} download={m.attachment.filename} className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 ${mine ? "bg-white/20" : "bg-slate-100 dark:bg-slate-700"}`} data-testid="chat-file">
                      <span aria-hidden="true">📎</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium underline">{m.attachment.filename}</span>
                        <span className="block text-xs opacity-80">{fmtSize(m.attachment.size)}</span>
                      </span>
                    </a>
                  ))}
                {m.body && (
                  <p className="whitespace-pre-wrap break-words" data-testid="chat-text">
                    <Body text={m.body} />
                  </p>
                )}
              </>
            )}
            {!editing && (
              <span className={`mt-0.5 block text-right text-[11px] ${mine && !m.deleted ? "text-white/75" : "text-slate-500"}`}>
                {m.edited && <span data-testid="chat-edited">edited · </span>}
                {fmtTime(m.createdAt)}
              </span>
            )}
          </div>
        </div>
        {confirm && (
          <div className="mt-1 flex items-center gap-2 text-xs" role="alert" data-testid="chat-delete-confirm">
            <span className="text-slate-700 dark:text-slate-200">Delete this message?</span>
            <button type="button" disabled={busy} onClick={doDelete} className="rounded bg-red-600 px-2 py-1 font-semibold text-white disabled:opacity-60" data-testid="chat-delete-yes">
              Delete
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700" data-testid="chat-delete-no">
              Keep
            </button>
          </div>
        )}
        {err && (
          <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300" data-testid="chat-msg-error">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
