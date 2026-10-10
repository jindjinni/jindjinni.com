"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { hideContactAction, importContactsAction, saveContactAction } from "@/app/actions/shipping-dept";
import { ghostBtn, primaryBtn, field } from "@/components/sales-ui";
import { CONTACT_KINDS } from "@/lib/shipping-address-rules";
import { AddressFields, emptyAddress, type AddressValue } from "./address-fields";

export type ContactRow = AddressValue & { id: string; kind: string; notes: string; hidden: boolean; fromSource: boolean; ready: boolean };

type Words = { buyers: string };

const kindWord = (k: string, w: Words) => (k === "BUYER" ? w.buyers : k === "SELLER" ? "Seller" : k === "SUPPLIER" ? "Supplier" : "Other");

/** Add, edit and hide address profiles; bring them over from Sales and Purchasing. Everything is checked again on the server. */
export function AddressManager({ rows, canWrite, preview, words }: { rows: ContactRow[]; canWrite: boolean; preview: { sales_buyer: number; purchasing_customer: number; purchasing_supplier: number }; words: Words }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [kind, setKind] = useState("BUYER");
  const [form, setForm] = useState<AddressValue>(emptyAddress);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pick, setPick] = useState<string[]>(["sales_buyer", "purchasing_customer", "purchasing_supplier"].filter((k) => preview[k as keyof typeof preview] > 0));

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Saved." });
      after?.();
      router.refresh();
    });
  };
  const open = (r: ContactRow | null) => {
    setEditing(r ? r.id : "new");
    setKind(r?.kind ?? "BUYER");
    setForm(r ? { name: r.name, company: r.company, street1: r.street1, street2: r.street2, city: r.city, state: r.state, zip: r.zip, phone: r.phone, email: r.email, isResidential: r.isResidential } : emptyAddress);
    setNotes(r?.notes ?? "");
    setMsg(null);
  };
  const total = preview.sales_buyer + preview.purchasing_customer + preview.purchasing_supplier;
  const groups: [keyof typeof preview, string][] = [
    ["sales_buyer", `${words.buyers} from Sales`],
    ["purchasing_customer", "Sellers from Purchasing"],
    ["purchasing_supplier", "Suppliers from Purchasing"],
  ];
  return (
    <div className="space-y-4">
      {canWrite && total > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30" data-testid="import-box">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Bring over your contacts</p>
          <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">Copies names and addresses from where you already keep them. Nothing there is changed, and anyone already brought over is skipped.</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {groups.map(([k, label]) =>
              preview[k] > 0 ? (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pick.includes(k)} onChange={(e) => setPick(e.target.checked ? [...pick, k] : pick.filter((x) => x !== k))} data-testid={`import-${k}`} />
                  {label} ({preview[k]})
                </label>
              ) : null,
            )}
            <button type="button" disabled={pending || pick.length === 0} className={primaryBtn} onClick={() => run(() => importContactsAction(pick))} data-testid="import-go">{pending ? "Bringing over…" : "Bring them over"}</button>
          </div>
        </div>
      )}

      {canWrite && editing === null && (
        <button type="button" className={ghostBtn} onClick={() => open(null)} data-testid="addr-add">Add an address</button>
      )}

      {editing !== null && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="addr-form">
          <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">{editing === "new" ? "New address" : "Edit address"}</p>
          <div className="mb-3 max-w-xs">
            <label htmlFor="addr-kind" className="text-xs font-medium text-slate-700 dark:text-slate-300">Who is this?</label>
            <select id="addr-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`} data-testid="addr-kind">
              {CONTACT_KINDS.map((k) => <option key={k} value={k}>{kindWord(k, words)}</option>)}
            </select>
          </div>
          <AddressFields idp="addr" value={form} onChange={setForm} />
          <div className="mt-3">
            <label htmlFor="addr-notes" className="text-xs font-medium text-slate-700 dark:text-slate-300">Notes (optional)</label>
            <input id="addr-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={`${field} mt-1`} />
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" disabled={pending} className={primaryBtn} data-testid="addr-save" onClick={() => run(() => saveContactAction(editing === "new" ? null : editing, { kind, ...form, notes }), () => setEditing(null))}>{pending ? "Saving…" : "Save address"}</button>
            <button type="button" className={ghostBtn} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "addr-ok" : "addr-error"}>{msg.text}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400" data-testid="addr-empty">No addresses here yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" data-testid="addr-list">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_1.3fr_auto] sm:items-center" data-testid="addr-row">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{r.company || r.name}</p>
                <p className="text-xs text-slate-500">{kindWord(r.kind, words)}{r.company && r.name !== r.company ? ` · ${r.name}` : ""}{r.fromSource ? " · brought over" : ""}</p>
              </div>
              <p className={`text-xs ${r.ready ? "text-slate-700 dark:text-slate-300" : "text-amber-700 dark:text-amber-300"}`}>
                {r.ready ? `${r.street1}${r.street2 ? `, ${r.street2}` : ""}, ${r.city}, ${r.state} ${r.zip}` : "Address incomplete. Add the street, city, state and ZIP before making a label."}
              </p>
              <div className="flex items-center gap-3 sm:justify-end">
                {canWrite && !r.hidden && <Link href={`/dashboard/shipping/new?contact=${r.id}`} className="text-xs font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="addr-ship">Ship to this address</Link>}
                {canWrite && <button type="button" className="text-xs underline" onClick={() => open(r)} data-testid="addr-edit">Edit</button>}
                {canWrite && <button type="button" disabled={pending} className="text-xs text-slate-500 underline" onClick={() => run(() => hideContactAction(r.id, !r.hidden))} data-testid="addr-hide">{r.hidden ? "Show again" : "Hide"}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
