"use client";

import { useState } from "react";
import { field } from "@/components/sales-ui";
import { parseUsAddress } from "@/lib/shipping-address-rules";

export type AddressValue = { name: string; company: string; street1: string; street2: string; city: string; state: string; zip: string; phone: string; email: string; isResidential: boolean };

export const emptyAddress: AddressValue = { name: "", company: "", street1: "", street2: "", city: "", state: "", zip: "", phone: "", email: "", isResidential: false };

/** The address boxes, with a "paste the whole address" shortcut that fills street, city, state and ZIP for you. */
export function AddressFields({ value, onChange, idp }: { value: AddressValue; onChange: (v: AddressValue) => void; idp: string }) {
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const set = (k: keyof AddressValue, v: string | boolean) => onChange({ ...value, [k]: v });
  const lab = "text-xs font-medium text-slate-700 dark:text-slate-300";
  const apply = () => {
    const p = parseUsAddress(paste);
    if (!p) return setNote("Couldn't read that. Type the parts into the boxes below.");
    onChange({ ...value, street1: p.street1, street2: p.street2 ?? "", city: p.city, state: p.state, zip: p.zip });
    setNote("Filled in below. Check it.");
  };
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idp}-paste`} className={lab}>Paste the whole address (optional)</label>
        <div className="mt-1 flex gap-2">
          <input id={`${idp}-paste`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="123 Main St, Suite 4, Austin, TX 78701" className={field} data-testid={`${idp}-paste`} />
          <button type="button" onClick={apply} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" data-testid={`${idp}-paste-go`}>Fill in</button>
        </div>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${idp}-name`} className={lab}>Contact name</label><input id={`${idp}-name`} value={value.name} onChange={(e) => set("name", e.target.value)} className={`${field} mt-1`} data-testid={`${idp}-name`} /></div>
        <div><label htmlFor={`${idp}-company`} className={lab}>Company or pharmacy</label><input id={`${idp}-company`} value={value.company} onChange={(e) => set("company", e.target.value)} className={`${field} mt-1`} data-testid={`${idp}-company`} /></div>
        <div className="sm:col-span-2"><label htmlFor={`${idp}-street1`} className={lab}>Street</label><input id={`${idp}-street1`} value={value.street1} onChange={(e) => set("street1", e.target.value)} className={`${field} mt-1`} data-testid={`${idp}-street1`} /></div>
        <div className="sm:col-span-2"><label htmlFor={`${idp}-street2`} className={lab}>Suite, unit (optional)</label><input id={`${idp}-street2`} value={value.street2} onChange={(e) => set("street2", e.target.value)} className={`${field} mt-1`} /></div>
        <div><label htmlFor={`${idp}-city`} className={lab}>City</label><input id={`${idp}-city`} value={value.city} onChange={(e) => set("city", e.target.value)} className={`${field} mt-1`} data-testid={`${idp}-city`} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor={`${idp}-state`} className={lab}>State</label><input id={`${idp}-state`} value={value.state} maxLength={20} onChange={(e) => set("state", e.target.value)} placeholder="TX" className={`${field} mt-1`} data-testid={`${idp}-state`} /></div>
          <div><label htmlFor={`${idp}-zip`} className={lab}>ZIP</label><input id={`${idp}-zip`} value={value.zip} maxLength={10} onChange={(e) => set("zip", e.target.value)} className={`${field} mt-1`} data-testid={`${idp}-zip`} /></div>
        </div>
        <div><label htmlFor={`${idp}-phone`} className={lab}>Phone</label><input id={`${idp}-phone`} value={value.phone} onChange={(e) => set("phone", e.target.value)} className={`${field} mt-1`} /></div>
        <div><label htmlFor={`${idp}-email`} className={lab}>Email</label><input id={`${idp}-email`} value={value.email} onChange={(e) => set("email", e.target.value)} className={`${field} mt-1`} data-testid={`${idp}-email`} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={value.isResidential} onChange={(e) => set("isResidential", e.target.checked)} />
        This is a home address
      </label>
    </div>
  );
}
