"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { moveReceivingCard } from "@/app/actions/receiving";
import type { BoardCard } from "@/lib/receiving-queries";
import { BOARD_COLUMNS, BOARD_COLUMN_LABELS, STATUS_LABELS, type BoardColumn } from "@/lib/receiving-rules";
import { MONEY, STATUS_PILL, chipClass, formatStamp } from "@/lib/receiving-ui";
import { ShipmentMenu } from "./shipment-menu";

const PILL: Record<BoardColumn, string> = {
  UNCATEGORIZED: "border border-slate-400 text-slate-800 dark:text-slate-100",
  NEED_TO_BE_REVIEWED: "bg-yellow-400 text-yellow-950",
  NEED_ADJUSTED_QUOTATION: "bg-orange-600 text-white",
  NEED_TO_BE_RETURNED: "bg-red-600 text-white",
  NEED_TO_BE_PAID: "bg-blue-600 text-white",
  PAID: "bg-green-600 text-white",
};

export function BoardView({ cards, canMove, canDelete }: { cards: BoardCard[]; canMove: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [moved, setMoved] = useState<Record<string, BoardColumn>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<BoardColumn | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [, startTransition] = useTransition();

  const colOf = (c: BoardCard): BoardColumn => moved[c.id] ?? c.column;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const live = cards.filter((c) => !deleted.has(c.id));
    return t ? live.filter((c) => c.searchText.includes(t)) : live;
  }, [cards, q, deleted]);
  const total = cards.filter((c) => !deleted.has(c.id)).length;

  function move(id: string, to: BoardColumn) {
    const card = cards.find((c) => c.id === id);
    if (!card || !canMove || colOf(card) === to) return;
    const before = moved[id];
    setError("");
    setNotice("");
    setMoved((m) => ({ ...m, [id]: to }));
    startTransition(async () => {
      const res = await moveReceivingCard(id, to);
      if (res.error) {
        setError(res.error);
        setMoved((m) => {
          const next = { ...m };
          if (before) next[id] = before;
          else delete next[id];
          return next;
        });
        return;
      }
      if (res.notice) setNotice(res.notice);
      router.refresh();
    });
  }

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">All Shipments</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {total} {total === 1 ? "shipment" : "shipments"}
            {canMove ? " · drag a shipment to another column to change where it stands" : ""}{canDelete ? " · use the ⋯ on a card to delete one pulled over by mistake" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="board-search" className="sr-only">Search shipments</label>
          <input
            id="board-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, order # or tracking"
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Link href="/dashboard/receiving/intake" className="rounded-lg bg-[#F7B838] px-3 py-2 text-sm font-semibold text-amber-950 hover:brightness-95">
            Receive an order
          </Link>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/50 dark:text-green-200">{notice}</p>}

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => {
          const list = shown.filter((c) => colOf(c) === col);
          const over = overCol === col && dragId !== null;
          return (
            <section
              key={col}
              aria-label={BOARD_COLUMN_LABELS[col]}
              onDragOver={(e) => {
                if (!canMove || !dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overCol !== col) setOverCol(col);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCol((c) => (c === col ? null : c));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOverCol(null);
                setDragId(null);
                if (id) move(id, col);
              }}
              className={`w-72 shrink-0 rounded-xl p-2 transition-colors ${over ? "bg-amber-100/70 ring-2 ring-amber-400 dark:bg-amber-950/40" : ""}`}
            >
              <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
                <span className={`truncate rounded-full px-3 py-1 ${PILL[col]}`}>{BOARD_COLUMN_LABELS[col]}</span>
                <span className="text-xs font-normal text-slate-500">{list.length}</span>
              </h2>
              <div className="flex max-h-[calc(100vh-15rem)] min-h-24 flex-col gap-3 overflow-y-auto pr-1">
                {list.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">No shipments</p>}
                {list.map((c) => (
                  <div
                    key={c.id}
                    draggable={canMove}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    className={`relative rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === c.id ? "opacity-40" : ""}`}
                  >
                    <Link
                      href={`/dashboard/receiving/intake/${c.id}`}
                      draggable={false}
                      className="block overflow-hidden rounded-t-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600"
                    >
                      {c.coverPhotoId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/receiving/photos/${c.coverPhotoId}`} alt="Unopened package" loading="lazy" draggable={false} className="h-36 w-full object-cover" />
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center bg-stone-100 text-xs text-slate-500 dark:bg-slate-800">No package photo yet</div>
                      )}
                      <div className="space-y-2 p-3">
                        <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">{c.trackingNumber || "No tracking #"}</p>
                        <dl className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                          <div>
                            <dt>Shipment Title</dt>
                            <dd className="truncate text-sm text-slate-900 dark:text-slate-100">{[c.customerName, c.quotationNumber, c.trackingNumber].filter(Boolean).join(" — ")}</dd>
                          </div>
                          <div>
                            <dt>Customer Name</dt>
                            <dd><span className={`inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-sm font-medium ${chipClass(c.customerName)}`}>{c.customerName}</span></dd>
                          </div>
                          <div>
                            <dt>Order Reference &amp; Tracking #</dt>
                            <dd className="truncate rounded bg-slate-100 px-2 py-1 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100">{[c.quotationNumber, c.trackingNumber].filter(Boolean).join(" — ")}</dd>
                          </div>
                          <div>
                            <dt>Order Total</dt>
                            <dd><span className="inline-block rounded-full bg-sky-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-sky-900 dark:bg-sky-900/50 dark:text-sky-100">{MONEY.format(c.grandTotal)}</span></dd>
                          </div>
                          <div>
                            <dt>Date/Time Received</dt>
                            <dd className="text-sm text-slate-900 dark:text-slate-100">{formatStamp(c.receivedAt)}</dd>
                          </div>
                          <div>
                            <dt>Receiving</dt>
                            <dd><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[c.status]}`}>{STATUS_LABELS[c.status]}</span></dd>
                          </div>
                          {c.accountsStatus && (
                            <div>
                              <dt>Accounts Status</dt>
                              <dd><span className="inline-block rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">{c.accountsStatus === "PAID" ? "Paid" : "In Review"}</span></dd>
                            </div>
                          )}
                          <div>
                            <dt>Adjustment Needed?</dt>
                            <dd>
                              {c.adjustmentNeeded === "YES" ? (
                                <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">Yes</span>
                              ) : c.adjustmentNeeded === "NO" ? (
                                <span className="inline-block rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">No</span>
                              ) : (
                                <span className="text-xs text-slate-500">Not checked yet</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </Link>
                    {canDelete && (
                      <ShipmentMenu
                        id={c.id}
                        label={[c.customerName, c.quotationNumber, c.trackingNumber].filter(Boolean).join(" — ")}
                        submitted={c.status !== "IN_PROGRESS"}
                        className="absolute right-2 top-2 z-10"
                        onError={(m) => {
                          setNotice("");
                          setError(m);
                        }}
                        onDeleted={(id) => {
                          setError("");
                          setNotice("Shipment deleted. The order is back in Purchasing and can be received again.");
                          setDeleted((d) => new Set(d).add(id));
                          router.refresh();
                        }}
                      />
                    )}
                    {canMove && (
                      <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                        <label className="sr-only" htmlFor={`move-${c.id}`}>Move {c.customerName} to</label>
                        <select
                          id={`move-${c.id}`}
                          value={colOf(c)}
                          onChange={(e) => move(c.id, e.target.value as BoardColumn)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          {BOARD_COLUMNS.map((k) => <option key={k} value={k}>{BOARD_COLUMN_LABELS[k]}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
