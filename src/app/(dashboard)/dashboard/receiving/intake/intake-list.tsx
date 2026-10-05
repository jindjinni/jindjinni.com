"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { startReceiving, searchOrdersToReceive } from "@/app/actions/receiving";
import type { BoardCard, QuotationBrief } from "@/lib/receiving-queries";
import { STATUS_LABELS } from "@/lib/receiving-rules";
import { STATUS_PILL, chipClass } from "@/lib/receiving-ui";
import { ShipmentMenu } from "../shipment-menu";

type Found = QuotationBrief & { packageId: string | null };

export function IntakeList({ cards, canWrite }: { cards: BoardCard[]; canWrite: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [listError, setListError] = useState("");
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const live = cards.filter((c) => !deleted.has(c.id));
    return t ? live.filter((c) => c.searchText.includes(t)) : live;
  }, [cards, q, deleted]);

  function search() {
    setError("");
    startTransition(async () => {
      setFound(await searchOrdersToReceive(term));
    });
  }

  function begin(quotationId: string) {
    setError("");
    startTransition(async () => {
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, "0");
      const localNow = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
      const res = await startReceiving(quotationId, localNow);
      if (res.error || !res.id) {
        setError(res.error ?? "Couldn't start receiving.");
        return;
      }
      setFound(null);
      setTerm("");
      router.push(`/dashboard/receiving/intake/${res.id}`);
    });
  }

  return (
    <div className="flex flex-col">
      {canWrite && (
        <div className="border-b border-slate-200 bg-amber-50 p-3 dark:border-slate-800 dark:bg-amber-950/30">
          <label htmlFor="start-search" className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            Receive an order
          </label>
          <form
            className="mt-1.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              id="start-search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Order #, customer or tracking #"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button disabled={pending || term.trim().length < 2} className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-3 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-50">
              Find
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
          {found && (
            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {found.length === 0 && <li className="p-3 text-sm text-slate-600 dark:text-slate-400">No matching orders in the Quotation Summary.</li>}
              {found.map((f) => (
                <li key={f.quotationId} className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{f.customerName}</p>
                    <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                      {f.quotationNumber}
                      {f.trackingNumber ? ` · ${f.trackingNumber}` : ""}
                    </p>
                  </div>
                  {f.packageId ? (
                    <Link href={`/dashboard/receiving/intake/${f.packageId}`} className="shrink-0 text-xs font-medium text-amber-800 underline dark:text-amber-300">
                      Open
                    </Link>
                  ) : (
                    <button onClick={() => begin(f.quotationId)} disabled={pending} className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
                      Start
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <label htmlFor="list-search" className="sr-only">Search shipments</label>
        <input
          id="list-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search shipments"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <ul>
        {listError && <li role="alert" className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{listError}</li>}
        {shown.length === 0 && <li className="p-4 text-sm text-slate-500">{cards.length - deleted.size === 0 ? "No shipments yet. Find an order above to start receiving it." : "No shipments match."}</li>}
        {shown.map((c) => {
          const href = `/dashboard/receiving/intake/${c.id}`;
          const active = path === href;
          return (
            <li key={c.id} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex gap-3 border-b border-slate-100 p-3 pr-12 hover:bg-amber-50 dark:border-slate-800/70 dark:hover:bg-slate-900 ${active ? "bg-amber-100/70 dark:bg-amber-950/40" : ""}`}
              >
                {c.coverPhotoId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/receiving/photos/${c.coverPhotoId}`}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                    className="h-14 w-14 shrink-0 rounded-md bg-stone-200 object-cover dark:bg-slate-800"
                  />
                ) : (
                  <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-stone-200 text-lg dark:bg-slate-800">📦</div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {c.customerName} — {c.quotationNumber}
                  </p>
                  <p className="truncate text-xs text-slate-600 dark:text-slate-400">{c.trackingNumber || "No tracking #"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass(c.customerName)}`}>{c.customerName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                  </div>
                </div>
              </Link>
              {canWrite && (
                <ShipmentMenu
                  id={c.id}
                  label={[c.customerName, c.quotationNumber, c.trackingNumber].filter(Boolean).join(" — ")}
                  submitted={c.status !== "IN_PROGRESS"}
                  className="absolute right-2 top-2"
                  onError={setListError}
                  onDeleted={(id) => {
                    setListError("");
                    setDeleted((d) => new Set(d).add(id));
                    if (active) router.push("/dashboard/receiving/intake");
                    router.refresh();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
