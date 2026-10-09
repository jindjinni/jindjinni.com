"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSupplierAction, setSupplierArchivedAction } from "@/app/actions/purchase-orders";
import { LICENSE_WARNING, licenseState, usDate } from "@/lib/purchase-order-rules";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type SupplierRow = { id: string; name: string; contactName: string; email: string; phone: string; address: string; licenseNumber: string; licenseExpires: string; notes: string; archived: boolean };

const blank = (): Omit<SupplierRow, "id" | "archived"> => ({ name: "", contactName: "", email: "", phone: "", address: "", licenseNumber: "", licenseExpires: "", notes: "" });
const label = "text-xs font-medium text-slate-700 dark:text-slate-300";

// The suppliers the company buys from, typed in once and saved. Each can be edited or archived (never deleted: old orders keep their copy).
export function SupplierManager({ rows, canWrite, today }: { rows: SupplierRow[]; canWrite: boolean; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(blank());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));

  const open = (r: SupplierRow | null) => {
    setMsg(null);
    setEditing(r ? r.id : "new");
    setF(r ? { name: r.name, contactName: r.contactName, email: r.email, phone: r.phone, address: r.address, licenseNumber: r.licenseNumber, licenseExpires: r.licenseExpires, notes: r.notes } : blank());
  };
  const save = () =>
    start(async () => {
      const res = await saveSupplierAction({ id: editing && editing !== "new" ? editing : null, ...f, licenseExpires: f.licenseExpires || null });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: "Saved." });
      setEditing(null);
      router.refresh();
    });
  const archive = (id: string, archived: boolean) =>
    start(async () => {
      const res = await setSupplierArchivedAction(id, archived);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Done." } : { ok: false, text: res.error });
      router.refresh();
    });

  const shown = rows.filter((r) => showArchived || !r.archived);
  return (
    <div className="mt-5 space-y-3" data-testid="supplier-manager">
      <div className="flex flex-wrap items-center gap-3">
        {canWrite && <button type="button" onClick={() => open(null)} className={primaryBtn} data-testid="supplier-new">+ Add a supplier</button>}
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "supplier-message" : "supplier-error"}>{msg.text}</span>}
      </div>

      {editing && (
        <div className={`${card} space-y-3`} data-testid="supplier-form">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{editing === "new" ? "New supplier" : "Edit supplier"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="sup-name" className={label}>Company name</label><input id="sup-name" value={f.name} onChange={(e) => set("name", e.target.value)} className={`${field} mt-1`} data-testid="sup-name" /></div>
            <div><label htmlFor="sup-contact" className={label}>Contact person</label><input id="sup-contact" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} className={`${field} mt-1`} data-testid="sup-contact" /></div>
            <div><label htmlFor="sup-email" className={label}>Email (orders are sent here)</label><input id="sup-email" value={f.email} onChange={(e) => set("email", e.target.value)} className={`${field} mt-1`} data-testid="sup-email" /></div>
            <div><label htmlFor="sup-phone" className={label}>Phone</label><input id="sup-phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={`${field} mt-1`} data-testid="sup-phone" /></div>
            <div className="sm:col-span-2"><label htmlFor="sup-address" className={label}>Address</label><textarea id="sup-address" rows={3} value={f.address} onChange={(e) => set("address", e.target.value)} className={`${field} mt-1`} data-testid="sup-address" /></div>
            <div><label htmlFor="sup-license" className={label}>License number</label><input id="sup-license" value={f.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} className={`${field} mt-1`} data-testid="sup-license" /></div>
            <div><label htmlFor="sup-expires" className={label}>License expires</label><input id="sup-expires" type="date" value={f.licenseExpires} onChange={(e) => set("licenseExpires", e.target.value)} className={`${field} mt-1`} data-testid="sup-expires" /></div>
            <div className="sm:col-span-2"><label htmlFor="sup-notes" className={label}>Notes (only your team sees these)</label><textarea id="sup-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${field} mt-1`} data-testid="sup-notes" /></div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={save} className={primaryBtn} data-testid="sup-save">{pending ? "Saving…" : "Save supplier"}</button>
            <button type="button" onClick={() => setEditing(null)} className={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="supplier-empty">No suppliers yet. Add the wholesalers you buy from once, and pick them on every order.</p>
      ) : (
        <ul className="space-y-2" data-testid="supplier-list">
          {shown.map((r) => {
            const lic = licenseState(r.licenseExpires || null, today);
            return (
              <li key={r.id} className={`${card} flex flex-wrap items-start justify-between gap-3 ${r.archived ? "opacity-60" : ""}`} data-testid="supplier-row">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{r.name}{r.archived ? " (archived)" : ""}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{[r.contactName, r.email, r.phone].filter(Boolean).join(" · ")}</p>
                  {r.licenseNumber && <p className="text-xs text-slate-600 dark:text-slate-400">License {r.licenseNumber}{r.licenseExpires ? `, expires ${usDate(r.licenseExpires)}` : ""}</p>}
                  {LICENSE_WARNING[lic] && <p className={`mt-1 text-xs font-medium ${lic === "expired" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`} data-testid="supplier-license-warning">{LICENSE_WARNING[lic]}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!r.archived && canWrite && <Link href={`/dashboard/purchasing/purchase-orders/new?supplier=${r.id}`} className={ghostBtn} data-testid="supplier-order">New order</Link>}
                  {canWrite && <button type="button" onClick={() => open(r)} className={ghostBtn} data-testid="supplier-edit">Edit</button>}
                  {canWrite && <button type="button" disabled={pending} onClick={() => archive(r.id, !r.archived)} className={ghostBtn} data-testid="supplier-archive">{r.archived ? "Restore" : "Archive"}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
