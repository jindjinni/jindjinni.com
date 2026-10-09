"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { savePurchaseOrderAction, saveSupplierAction } from "@/app/actions/purchase-orders";
import { LICENSE_WARNING, PO_UNITS, computeTotals, licenseState } from "@/lib/purchase-order-rules";
import { card, field, fmtMoney, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type EditorSupplier = { id: string; name: string; email: string; address: string; license: string; licenseExpires: string };
export type EditorCatalogItem = { id: string; name: string; ndc: string; partNumber: string };
export type EditorLine = { rid: number; productId: string | null; partNumber: string; ndc: string; name: string; size: string; quantity: string; unit: string; unitCost: string };
export type EditorInitial = {
  supplierId: string;
  supplierName: string;
  supplierAddress: string;
  supplierEmail: string;
  supplierLicense: string;
  supplierLicenseExpires: string;
  issueDate: string;
  shipToName: string;
  shipToAddress: string;
  billToName: string;
  billToAddress: string;
  reference: string;
  comments: string;
  terms: string;
  shipping: string;
  lines: Omit<EditorLine, "rid">[];
};

// Lines added after the page loads count up from 1000; the ones it opens with are 1, 2, ... so the server's HTML and the browser agree on the field ids.
let counter = 1000;
const blankLine = (): EditorLine => ({ rid: ++counter, productId: null, partNumber: "", ndc: "", name: "", size: "", quantity: "", unit: "EA", unitCost: "" });
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const cleanNum = (s: string) => s.replace(/[^\d.]/g, "");
const label = "text-xs font-medium text-slate-700 dark:text-slate-300";

export function PoEditor(props: { docId: string | null; number: string | null; initial: EditorInitial; suppliers: EditorSupplier[]; catalog: EditorCatalogItem[]; today: string }) {
  const { docId, suppliers, catalog, today } = props;
  const router = useRouter();
  const [h, setH] = useState(props.initial);
  const [lines, setLines] = useState<EditorLine[]>(() => (props.initial.lines.length ? props.initial.lines.map((l, i) => ({ ...l, rid: i + 1 })) : [{ ...blankLine(), rid: 1 }]));
  const [remember, setRemember] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setHead = <K extends keyof EditorInitial>(k: K, v: EditorInitial[K]) => setH((p) => ({ ...p, [k]: v }));
  const patch = (rid: number, p: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.rid === rid ? { ...l, ...p } : l)));

  const totals = useMemo(() => computeTotals(lines.map((l) => ({ quantity: Math.trunc(Number(l.quantity)) || 0, unitCost: num(l.unitCost) })), num(h.shipping)), [lines, h.shipping]);
  const licState = licenseState(h.supplierLicenseExpires || null, today);

  function pickSupplier(id: string) {
    const s = suppliers.find((x) => x.id === id);
    if (!s) return setH((p) => ({ ...p, supplierId: "" }));
    setH((p) => ({ ...p, supplierId: s.id, supplierName: s.name, supplierAddress: s.address, supplierEmail: s.email, supplierLicense: s.license, supplierLicenseExpires: s.licenseExpires }));
  }

  // Typing a product that is in the catalog fills its NDC and part number (only where those are still empty).
  function nameChanged(rid: number, name: string) {
    const hit = catalog.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    const cur = lines.find((l) => l.rid === rid);
    patch(rid, hit ? { name, productId: hit.id, ndc: cur?.ndc || hit.ndc, partNumber: cur?.partNumber || hit.partNumber } : { name, productId: null });
  }

  function save() {
    setMsg(null);
    start(async () => {
      let supplierId: string | null = h.supplierId || null;
      if (!supplierId && remember && h.supplierName.trim()) {
        const s = await saveSupplierAction({ name: h.supplierName, email: h.supplierEmail, address: h.supplierAddress, licenseNumber: h.supplierLicense, licenseExpires: h.supplierLicenseExpires || null });
        if (!s.ok) return setMsg({ ok: false, text: s.error });
        supplierId = s.id ?? null;
      }
      const res = await savePurchaseOrderAction({
        id: docId,
        supplierId,
        supplierName: h.supplierName,
        supplierAddress: h.supplierAddress,
        supplierEmail: h.supplierEmail,
        supplierLicense: h.supplierLicense,
        supplierLicenseExpires: h.supplierLicenseExpires || null,
        issueDate: h.issueDate,
        shipToName: h.shipToName,
        shipToAddress: h.shipToAddress,
        billToName: h.billToName,
        billToAddress: h.billToAddress,
        reference: h.reference,
        comments: h.comments,
        terms: h.terms,
        shipping: num(h.shipping),
        lines: lines.map((l) => ({ productId: l.productId, partNumber: l.partNumber, ndc: l.ndc, name: l.name, size: l.size, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost })),
      });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      if (!docId && res.id) router.replace(`/dashboard/purchasing/purchase-orders/${res.id}`);
      else {
        setMsg({ ok: true, text: res.message ?? "Saved." });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4" data-testid="po-editor">
      <datalist id="po-catalog">
        {catalog.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>

      {/* Supplier */}
      <div className={`${card} space-y-3`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="po-supplier" className={label}>Saved supplier</label>
            <select id="po-supplier" value={h.supplierId} onChange={(e) => pickSupplier(e.target.value)} className={`${field} mt-1`} data-testid="po-supplier">
              <option value="">Type a new one below…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="po-supplier-name" className={label}>Supplier name on this order</label>
            <input id="po-supplier-name" value={h.supplierName} onChange={(e) => setHead("supplierName", e.target.value)} className={`${field} mt-1`} data-testid="po-supplier-name" />
          </div>
          <div>
            <label htmlFor="po-supplier-email" className={label}>Supplier email (the order is sent here)</label>
            <input id="po-supplier-email" value={h.supplierEmail} onChange={(e) => setHead("supplierEmail", e.target.value)} className={`${field} mt-1`} data-testid="po-supplier-email" />
          </div>
          <div>
            <label htmlFor="po-supplier-address" className={label}>Supplier address</label>
            <textarea id="po-supplier-address" rows={3} value={h.supplierAddress} onChange={(e) => setHead("supplierAddress", e.target.value)} className={`${field} mt-1`} data-testid="po-supplier-address" />
          </div>
          <div>
            <label htmlFor="po-license" className={label}>License number</label>
            <input id="po-license" value={h.supplierLicense} onChange={(e) => setHead("supplierLicense", e.target.value)} className={`${field} mt-1`} data-testid="po-license" />
          </div>
          <div>
            <label htmlFor="po-license-exp" className={label}>License expires</label>
            <input id="po-license-exp" type="date" value={h.supplierLicenseExpires} onChange={(e) => setHead("supplierLicenseExpires", e.target.value)} className={`${field} mt-1`} data-testid="po-license-exp" />
          </div>
        </div>
        {LICENSE_WARNING[licState] && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${licState === "expired" ? "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" : "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`} data-testid="po-license-warning">
            {LICENSE_WARNING[licState]}
          </p>
        )}
        {!h.supplierId && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="po-remember" /> Save this supplier so I can pick it next time
          </label>
        )}
      </div>

      {/* Dates, ship to, bill to */}
      <div className={`${card} space-y-3`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="po-date" className={label}>Issue date</label>
            <input id="po-date" type="date" value={h.issueDate} onChange={(e) => setHead("issueDate", e.target.value)} className={`${field} mt-1`} data-testid="po-date" />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="po-ref" className={label}>Reference (your own reference, or the supplier&apos;s quotation number)</label>
            <input id="po-ref" value={h.reference} onChange={(e) => setHead("reference", e.target.value)} className={`${field} mt-1`} data-testid="po-ref" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="po-ship-name" className={label}>Ship to: name</label>
            <input id="po-ship-name" value={h.shipToName} onChange={(e) => setHead("shipToName", e.target.value)} className={`${field} mt-1`} data-testid="po-ship-name" />
            <label htmlFor="po-ship-address" className={`${label} mt-2 block`}>Ship to: address</label>
            <textarea id="po-ship-address" rows={3} value={h.shipToAddress} onChange={(e) => setHead("shipToAddress", e.target.value)} className={`${field} mt-1`} data-testid="po-ship-address" />
          </div>
          <div>
            <label htmlFor="po-bill-name" className={label}>Bill to: name</label>
            <input id="po-bill-name" value={h.billToName} onChange={(e) => setHead("billToName", e.target.value)} className={`${field} mt-1`} data-testid="po-bill-name" />
            <label htmlFor="po-bill-address" className={`${label} mt-2 block`}>Bill to: address</label>
            <textarea id="po-bill-address" rows={3} value={h.billToAddress} onChange={(e) => setHead("billToAddress", e.target.value)} className={`${field} mt-1`} data-testid="po-bill-address" />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</h2>
        {lines.map((l, i) => {
          const total = (Math.trunc(Number(l.quantity)) || 0) * num(l.unitCost);
          return (
            <div key={l.rid} className={`${card} space-y-3`} data-testid="po-line">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Item {i + 1}</p>
                {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.rid !== l.rid))} className="text-xs text-red-700 underline dark:text-red-300" data-testid="po-remove-line">Remove</button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <label htmlFor={`po-name-${l.rid}`} className={label}>Item name (start typing to pick from your products)</label>
                  <input id={`po-name-${l.rid}`} list="po-catalog" value={l.name} onChange={(e) => nameChanged(l.rid, e.target.value)} autoComplete="off" className={`${field} mt-1`} data-testid="po-name" />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`po-part-${l.rid}`} className={label}>Part number</label>
                  <input id={`po-part-${l.rid}`} value={l.partNumber} onChange={(e) => patch(l.rid, { partNumber: e.target.value })} className={`${field} mt-1`} data-testid="po-part" />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`po-ndc-${l.rid}`} className={label}>NDC</label>
                  <input id={`po-ndc-${l.rid}`} value={l.ndc} onChange={(e) => patch(l.rid, { ndc: e.target.value })} placeholder="12345-678-90" className={`${field} mt-1`} data-testid="po-ndc" />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor={`po-size-${l.rid}`} className={label}>Size</label>
                  <input id={`po-size-${l.rid}`} value={l.size} onChange={(e) => patch(l.rid, { size: e.target.value })} className={`${field} mt-1`} data-testid="po-size" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-2">
                  <label htmlFor={`po-qty-${l.rid}`} className={label}>Quantity</label>
                  <input id={`po-qty-${l.rid}`} inputMode="numeric" value={l.quantity} onChange={(e) => patch(l.rid, { quantity: e.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1`} data-testid="po-qty" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`po-unit-${l.rid}`} className={label}>Unit</label>
                  <select id={`po-unit-${l.rid}`} value={l.unit} onChange={(e) => patch(l.rid, { unit: e.target.value })} className={`${field} mt-1`} data-testid="po-unit">
                    {PO_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`po-cost-${l.rid}`} className={label}>Net cost each ($)</label>
                  <input id={`po-cost-${l.rid}`} inputMode="decimal" value={l.unitCost} onChange={(e) => patch(l.rid, { unitCost: cleanNum(e.target.value) })} className={`${field} mt-1`} data-testid="po-cost" />
                </div>
                <div className="self-end text-right sm:col-span-5">
                  <p className="text-xs text-slate-500">Line total</p>
                  <p className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid="po-line-total">{fmtMoney(Math.round(total * 100) / 100)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className={ghostBtn} data-testid="po-add-line">+ Add an item</button>
      </div>

      {/* Notes, terms and totals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} space-y-3`}>
          <div>
            <label htmlFor="po-comments" className={label}>Comments (the supplier sees these)</label>
            <textarea id="po-comments" rows={3} value={h.comments} onChange={(e) => setHead("comments", e.target.value)} className={`${field} mt-1`} data-testid="po-comments" />
          </div>
          <div>
            <label htmlFor="po-terms" className={label}>Terms printed at the bottom (the next order starts from these)</label>
            <textarea id="po-terms" rows={5} value={h.terms} onChange={(e) => setHead("terms", e.target.value)} className={`${field} mt-1`} data-testid="po-terms" />
          </div>
        </div>
        <div className={`${card} space-y-1.5 text-sm`} data-testid="po-totals">
          <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total of items ({totals.units} units)</span><span className="tabular-nums" data-testid="po-subtotal">{fmtMoney(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="po-shipping" className="text-slate-600 dark:text-slate-400">Shipping</label>
            <input id="po-shipping" inputMode="decimal" value={h.shipping} onChange={(e) => setHead("shipping", cleanNum(e.target.value))} className={`${field} !w-28 text-right tabular-nums`} data-testid="po-shipping" />
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <span className="font-semibold text-slate-900 dark:text-slate-50">Grand total</span>
            <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid="po-total">{fmtMoney(totals.total)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={primaryBtn} data-testid="po-save">{pending ? "Saving…" : docId ? "Save changes" : "Save as a draft"}</button>
        <Link href="/dashboard/purchasing/purchase-orders" className={ghostBtn}>Cancel</Link>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "po-message" : "po-error"}>{msg.text}</span>}
      </div>
    </div>
  );
}
