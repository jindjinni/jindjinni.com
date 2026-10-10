"use client";

import Link from "next/link";
import { useState } from "react";
import { type SalesStatus } from "@/lib/sales-rules";
import { docPlural, dueShort, type DocKind } from "@/lib/sales-doc-ui";
import { StatusChip, card, field, fmtDay, fmtMoney } from "@/components/sales-ui";

export type DocRow = { id: string; number: string; buyer: string; date: string; due: string; total: number; balance: number; status: SalesStatus | "PAST_DUE"; units: number };

const ORDER: (SalesStatus | "PAST_DUE")[] = ["PAST_DUE", "PARTIALLY_PAID", "SENT", "DRAFT", "ACCEPTED", "PAID", "CONVERTED", "DECLINED", "VOID"];

// Quotations or invoices, grouped under closed headings by where they stand (Past due, Sent, Drafts, Paid ...), each
// heading showing how many and how much. A search opens the groups that have a match.
export function DocList({ kind, base, rows }: { kind: DocKind; base: string; rows: DocRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.number} ${r.buyer}`.toLowerCase().includes(needle));
  const groups = ORDER.map((s) => ({ s, rows: shown.filter((r) => r.status === s) })).filter((g) => g.rows.length);
  const word = docPlural(kind);
  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="doc-search" className="sr-only">Search {word}</label>
        <input id="doc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${word} by number or buyer`} className={`${field} max-w-xs`} data-testid="doc-search" />
        <p className="ml-auto text-sm text-slate-600 dark:text-slate-400" data-testid="doc-count">{rows.length} {rows.length === 1 ? word.slice(0, -1) : word}</p>
      </div>
      {groups.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="doc-empty">
          {rows.length === 0 ? `No ${word} yet. Use the button above to make the first one.` : `No ${word.slice(0, -1)} matches that.`}
        </p>
      ) : (
        groups.map((g) => {
          const total = g.rows.reduce((n, r) => n + r.total, 0);
          const owed = g.rows.reduce((n, r) => n + r.balance, 0);
          return (
            <details key={g.s} open={!!needle} className={`${card} !p-0`} data-testid="doc-group" data-status={g.s}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                <StatusChip status={g.s} />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{g.rows.length} {g.rows.length === 1 ? word.slice(0, -1) : word}</span>
                <span className="ml-auto text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  {fmtMoney(total)}
                  {kind === "INVOICE" && owed > 0 && g.s !== "DRAFT" && <span className="ml-2 text-xs text-slate-500">· {fmtMoney(owed)} still owed</span>}
                </span>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/${r.id}`} className="grid gap-1 px-4 py-2.5 text-sm hover:bg-stone-50 sm:grid-cols-[5rem_1fr_7rem_7rem_6rem] sm:items-center dark:hover:bg-slate-800/50" data-testid="doc-row">
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{kind === "INVOICE" ? "#" : ""}{r.number}</span>
                      <span className="truncate">{r.buyer}</span>
                      <span className="text-slate-500">{fmtDay(r.date)}</span>
                      <span className={g.s === "PAST_DUE" ? "font-medium text-red-700 dark:text-red-300" : "text-slate-500"}>{r.due ? `${dueShort(kind)} ${fmtDay(r.due)}` : ""}</span>
                      <span className="tabular-nums sm:text-right">{fmtMoney(r.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        })
      )}
    </div>
  );
}
