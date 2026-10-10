"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { reviseDocumentAction, saveDocumentAction } from "@/app/actions/sales";
import { normKey } from "@/lib/inventory-rules";
import { dateLabel, docWord, dueLabel, refLabel, type DocKind } from "@/lib/sales-doc-ui";
import { availability, computeTotals, dueDateFor, lineAmount, reserveKey, TERMS_OPTIONS, type Reserved, type StockMap } from "@/lib/sales-rules";
import { card, field, fmtMoney, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type EditorBuyer = { id: string; name: string; contact: string; email: string; phone: string; billing: string; shipping: string; terms: string; notes: string };
export type EditorProduct = { id: string; key: string; name: string; brand: string; code?: string | null };
export type EditorLine = { rid: number; productKey: string; productId: string | null; productName: string; condition: string; groupKey: string | null; groupLabel: string | null; quantity: string; unitPrice: string; note: string; ndc: string };
export type EditorInitial = {
  buyerId: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  billing: string;
  shipping: string;
  docDate: string;
  dueDate: string;
  terms: string;
  reference: string;
  discount: string;
  shipping_: string;
  tax: string;
  other: string;
  notes: string;
  internalNotes: string;
  lines: Omit<EditorLine, "rid">[];
};

// Lines added after the page loads count up from 1000; the lines it opens with are numbered 1, 2, ... so the server's HTML and the browser agree on the field ids.
let counter = 1000;
const blankLine = (): EditorLine => ({ rid: ++counter, productKey: "", productId: null, productName: "", condition: "Mint", groupKey: null, groupLabel: null, quantity: "", unitPrice: "", note: "", ndc: "" });
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const cleanNum = (s: string) => s.replace(/[^\d.]/g, "");

export function DocEditor(props: {
  kind: DocKind;
  /** Revising a document that was already sent: a note is required and saving sends the revision. */
  revise?: boolean;
  docId: string | null;
  number: string | null;
  base: string;
  initial: EditorInitial;
  buyers: EditorBuyer[];
  products: EditorProduct[];
  conditions: string[];
  stock: StockMap;
  reserved: Reserved;
  buyerPrices: Record<string, Record<string, number>>;
}) {
  const { kind, docId, base, buyers, products, conditions, stock, reserved, buyerPrices } = props;
  const isInvoice = kind === "INVOICE";
  const isPo = kind === "PURCHASE_ORDER";
  const isSo = kind === "SALES_ORDER";
  const word = docWord(kind);
  const revising = !!props.revise && !!docId;
  const router = useRouter();
  const [revNote, setRevNote] = useState("");
  const [revEmail, setRevEmail] = useState(true);
  const [h, setH] = useState(props.initial);
  const [lines, setLines] = useState<EditorLine[]>(() => (props.initial.lines.length ? props.initial.lines.map((l, i) => ({ ...l, rid: i + 1 })) : [{ ...blankLine(), rid: 1 }]));
  const [dueTouched, setDueTouched] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setHead = <K extends keyof EditorInitial>(k: K, v: EditorInitial[K]) => setH((p) => ({ ...p, [k]: v }));
  const patch = (rid: number, p: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.rid === rid ? { ...l, ...p } : l)));

  const totals = useMemo(
    () => computeTotals({ lines: lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: num(l.unitPrice) })), discount: num(h.discount), shipping: num(h.shipping_), tax: num(h.tax), otherCharges: num(h.other) }),
    [lines, h.discount, h.shipping_, h.tax, h.other],
  );

  // What each line can still sell: the live stock, minus what other drafts hold and what this document's other lines already asked for.
  const stockFor = (l: EditorLine) => {
    const mine: Reserved = { ...reserved };
    for (const o of lines) {
      if (o.rid === l.rid || !o.productKey) continue;
      const k = reserveKey(o.productKey, o.condition, o.groupKey);
      mine[k] = (mine[k] ?? 0) + (Number(o.quantity) || 0);
    }
    const a = availability(stock, mine, l.productKey, l.condition, l.groupKey);
    const cond = stock[l.productKey]?.conditions[normKey(l.condition)];
    const groups = (cond?.groups ?? []).map((g) => ({ ...g, ...availability(stock, mine, l.productKey, l.condition, g.key) }));
    return { ...a, groups, anyCondition: Object.values(stock[l.productKey]?.conditions ?? {}) };
  };

  const short = isInvoice || isSo ? lines.filter((l) => l.productKey && (Number(l.quantity) || 0) > stockFor(l).available) : [];

  function pickBuyer(id: string) {
    const b = buyers.find((x) => x.id === id);
    if (!b) return setH((p) => ({ ...p, buyerId: "" }));
    const terms = b.terms || h.terms;
    setH((p) => ({
      ...p,
      buyerId: b.id,
      company: b.name,
      contact: b.contact,
      email: b.email,
      phone: b.phone,
      billing: b.billing,
      shipping: b.shipping,
      terms,
      notes: b.notes || p.notes,
      dueDate: dueTouched ? p.dueDate : dueDateFor(p.docDate, terms),
    }));
    // Fill prices from this buyer's price sheet for lines that have none yet.
    setLines((ls) => ls.map((l) => (l.productKey && !l.unitPrice ? { ...l, unitPrice: String(buyerPrices[b.id]?.[`${l.productKey}|${normKey(l.condition)}`] ?? "") } : l)));
  }

  function pickProduct(rid: number, p: EditorProduct) {
    const conds = Object.values(stock[p.key]?.conditions ?? {});
    const condition = conds.find((c) => normKey(c.condition) === "mint")?.condition ?? conds[0]?.condition ?? "Mint";
    const price = buyerPrices[h.buyerId]?.[`${p.key}|${normKey(condition)}`];
    patch(rid, { productKey: p.key, productId: p.id || null, productName: p.name, condition, groupKey: null, groupLabel: null, unitPrice: price != null ? String(price) : "", ndc: p.code ?? "" });
  }

  function changeCondition(l: EditorLine, condition: string) {
    const price = buyerPrices[h.buyerId]?.[`${l.productKey}|${normKey(condition)}`];
    patch(l.rid, { condition, groupKey: null, groupLabel: null, ...(price != null ? { unitPrice: String(price) } : {}) });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const doc = {
        buyerId: h.buyerId || null,
        buyerCompany: h.company,
        buyerContact: h.contact,
        buyerBillingAddress: h.billing,
        buyerShippingAddress: h.shipping,
        buyerEmail: h.email,
        buyerPhone: h.phone,
        docDate: h.docDate,
        dueDate: h.dueDate || null,
        terms: h.terms,
        reference: h.reference,
        discount: num(h.discount),
        shipping: num(h.shipping_),
        tax: num(h.tax),
        otherCharges: num(h.other),
        customerNotes: h.notes,
        internalNotes: h.internalNotes,
        lines: lines.map((l) => ({ productId: l.productId, productKey: l.productKey, productName: l.productName, condition: l.condition, groupKey: l.groupKey, groupLabel: l.groupLabel, quantity: Number(l.quantity), unitPrice: num(l.unitPrice), note: l.note || null, ndc: l.ndc || null })),
      };
      if (revising && docId) {
        const out = await reviseDocumentAction(docId, { note: revNote, edits: doc, email: revEmail, to: h.email });
        if (!out.ok) return setMsg({ ok: false, text: out.error });
        router.replace(`${base}/${docId}`);
        router.refresh();
        return;
      }
      const res = await saveDocumentAction({ id: docId, kind, ...doc });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      if (!docId && res.id) router.replace(`${base}/${res.id}`);
      else {
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4" data-testid="doc-editor">
      {/* Buyer and dates */}
      <div className={`${card} space-y-3`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isPo ? "From (the buyer who sent the order)" : isSo ? "Order for" : "Bill to"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="de-buyer" className="text-xs font-medium text-slate-700 dark:text-slate-300">Buyer</label>
            <select id="de-buyer" value={h.buyerId} onChange={(e) => pickBuyer(e.target.value)} className={`${field} mt-1`} data-testid="de-buyer">
              <option value="">Choose a buyer…</option>
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="de-company" className="text-xs font-medium text-slate-700 dark:text-slate-300">Company name on this {word}</label>
            <input id="de-company" value={h.company} onChange={(e) => setHead("company", e.target.value)} className={`${field} mt-1`} data-testid="de-company" />
          </div>
          <div>
            <label htmlFor="de-contact" className="text-xs font-medium text-slate-700 dark:text-slate-300">Contact</label>
            <input id="de-contact" value={h.contact} onChange={(e) => setHead("contact", e.target.value)} className={`${field} mt-1`} data-testid="de-contact" />
          </div>
          <div>
            <label htmlFor="de-email" className="text-xs font-medium text-slate-700 dark:text-slate-300">Email</label>
            <input id="de-email" value={h.email} onChange={(e) => setHead("email", e.target.value)} className={`${field} mt-1`} data-testid="de-email" />
          </div>
          <div>
            <label htmlFor="de-billing" className="text-xs font-medium text-slate-700 dark:text-slate-300">Billing address</label>
            <textarea id="de-billing" rows={3} value={h.billing} onChange={(e) => setHead("billing", e.target.value)} className={`${field} mt-1`} data-testid="de-billing" />
          </div>
          <div>
            <label htmlFor="de-shipping" className="text-xs font-medium text-slate-700 dark:text-slate-300">Ship to (blank = same as billing)</label>
            <textarea id="de-shipping" rows={3} value={h.shipping} onChange={(e) => setHead("shipping", e.target.value)} className={`${field} mt-1`} data-testid="de-shipping" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="de-date" className="text-xs font-medium text-slate-700 dark:text-slate-300">{dateLabel(kind)}</label>
            <input id="de-date" type="date" value={h.docDate} onChange={(e) => setH((p) => ({ ...p, docDate: e.target.value, dueDate: dueTouched ? p.dueDate : dueDateFor(e.target.value, isSo ? "Net 7" : p.terms) }))} className={`${field} mt-1`} data-testid="de-date" />
          </div>
          {(isInvoice || isSo) && (
            <div>
              <label htmlFor="de-terms" className="text-xs font-medium text-slate-700 dark:text-slate-300">Terms</label>
              <select id="de-terms" value={h.terms} onChange={(e) => setH((p) => ({ ...p, terms: e.target.value, dueDate: dueTouched || isSo ? p.dueDate : dueDateFor(p.docDate, e.target.value) }))} className={`${field} mt-1`} data-testid="de-terms">
                {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="de-due" className="text-xs font-medium text-slate-700 dark:text-slate-300">{dueLabel(kind)}</label>
            <input id="de-due" type="date" value={h.dueDate} onChange={(e) => { setDueTouched(true); setHead("dueDate", e.target.value); }} className={`${field} mt-1`} data-testid="de-due" />
          </div>
          <div>
            <label htmlFor="de-ref" className="text-xs font-medium text-slate-700 dark:text-slate-300">{refLabel(kind)}</label>
            <input id="de-ref" value={h.reference} onChange={(e) => setHead("reference", e.target.value)} className={`${field} mt-1`} data-testid="de-ref" />
          </div>
        </div>
      </div>

      {/* Items with live stock on the side */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</h2>
        {short.length > 0 && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="de-short-banner">
            {short.length === 1 ? "One item asks" : `${short.length} items ask`} for more than is available. {isSo ? "You can save the draft, but check the stock before you confirm it: the invoice can't be sent until the stock is there." : "You can save the draft, but it can't be sent until the stock is there."}
          </p>
        )}
        {lines.map((l, i) => (
          <LineRow
            key={l.rid}
            index={i}
            line={l}
            products={products}
            conditions={conditions}
            stock={stock}
            avail={l.productKey ? stockFor(l) : null}
            showStock={true}
            canRemove={lines.length > 1}
            buyerPrice={l.productKey && h.buyerId ? buyerPrices[h.buyerId]?.[`${l.productKey}|${normKey(l.condition)}`] ?? null : null}
            onPickProduct={(p) => pickProduct(l.rid, p)}
            onCondition={(c) => changeCondition(l, c)}
            onPatch={(p) => patch(l.rid, p)}
            onRemove={() => setLines((ls) => ls.filter((x) => x.rid !== l.rid))}
          />
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className={ghostBtn} data-testid="de-add-line">+ Add an item</button>
      </div>

      {/* Totals and notes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} space-y-3`}>
          <div>
            <label htmlFor="de-notes" className="text-xs font-medium text-slate-700 dark:text-slate-300">Notes on the {word} (the buyer sees these)</label>
            <textarea id="de-notes" rows={3} value={h.notes} onChange={(e) => setHead("notes", e.target.value)} className={`${field} mt-1`} data-testid="de-notes" />
          </div>
          <div>
            <label htmlFor="de-internal" className="text-xs font-medium text-slate-700 dark:text-slate-300">Private notes (only your team sees these)</label>
            <textarea id="de-internal" rows={2} value={h.internalNotes} onChange={(e) => setHead("internalNotes", e.target.value)} className={`${field} mt-1`} data-testid="de-internal" />
          </div>
        </div>
        <div className={`${card} space-y-1.5 text-sm`} data-testid="de-totals">
          <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Subtotal</span><span className="tabular-nums" data-testid="de-subtotal">{fmtMoney(totals.subtotal)}</span></div>
          {([["Discount", "discount", "de-discount"], ["Shipping", "shipping_", "de-shipping-charge"], ["Tax", "tax", "de-tax"], ["Other charges", "other", "de-other"]] as const).map(([label, key, tid]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <label htmlFor={tid} className="text-slate-600 dark:text-slate-400">{label}</label>
              <input id={tid} inputMode="decimal" value={h[key]} onChange={(e) => setHead(key, cleanNum(e.target.value))} className={`${field} !w-28 text-right tabular-nums`} data-testid={tid} />
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <span className="font-semibold text-slate-900 dark:text-slate-50">{isInvoice ? "Total due" : "Total"}</span>
            <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid="de-total">{fmtMoney(totals.total)}</span>
          </div>
        </div>
      </div>

      {revising && (
        <div className={`${card} space-y-3 !border-red-300 dark:!border-red-900`} data-testid="de-revise-box">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Revision note (required)</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Tell them what changed or what is wrong, for example &ldquo;you sent 15 boxes, not the 20 on the order&rdquo;. It prints in a highlighted box at the top of the revised {word} and in the email.</p>
          <textarea id="de-revnote" rows={3} value={revNote} onChange={(e) => setRevNote(e.target.value)} className={field} data-testid="de-revnote" />
          <label htmlFor="de-revemail" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input id="de-revemail" type="checkbox" checked={revEmail} onChange={(e) => setRevEmail(e.target.checked)} data-testid="de-revemail" />
            Email the revision{h.email ? ` to ${h.email}` : " (add their email address above)"}
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={primaryBtn} data-testid="de-save">{pending ? "Saving…" : revising ? (revEmail ? "Save and send revision" : "Save revision") : docId ? "Save changes" : `Save ${word} as a draft`}</button>
        <Link href={revising && docId ? `${base}/${docId}` : base === "/dashboard/sales/quotations" ? "/dashboard/sales" : base} className={ghostBtn}>Cancel</Link>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "de-message" : "de-error"}>{msg.text}</span>}
      </div>
    </div>
  );
}

type Avail = { onHand: number; held: number; available: number; groups: { key: string; label: string; onHand: number; from: string | null; to: string | null; available: number; held: number }[]; anyCondition: { condition: string; onHand: number }[] };

function LineRow(props: {
  index: number;
  line: EditorLine;
  products: EditorProduct[];
  conditions: string[];
  stock: StockMap;
  avail: Avail | null;
  showStock: boolean;
  canRemove: boolean;
  buyerPrice: number | null;
  onPickProduct: (p: EditorProduct) => void;
  onCondition: (c: string) => void;
  onPatch: (p: Partial<EditorLine>) => void;
  onRemove: () => void;
}) {
  const { line: l, avail, products, stock } = props;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = products.filter((p) => !needle || `${p.name} ${p.brand}`.toLowerCase().includes(needle));
    // Products you actually have come first.
    return list.sort((a, b) => Number(!!stock[b.key]) - Number(!!stock[a.key]) || a.name.localeCompare(b.name)).slice(0, 12);
  }, [products, needle, stock]);
  const qty = Number(l.quantity) || 0;
  const over = !!avail && qty > avail.available;
  const condOptions = [...new Set([...(avail?.anyCondition.map((c) => c.condition) ?? []), ...props.conditions])];
  const rid = l.rid;

  return (
    <div className={`${card} grid gap-4 lg:grid-cols-[1fr_16rem]`} data-testid="de-line">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Item {props.index + 1}</p>
          {props.canRemove && <button type="button" onClick={props.onRemove} className="text-xs text-red-700 underline dark:text-red-300" data-testid="de-remove-line">Remove</button>}
        </div>
        <div className="relative">
          <label htmlFor={`de-product-${rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Product</label>
          <input
            id={`de-product-${rid}`}
            value={open ? q : l.productName}
            placeholder="Start typing a product or brand…"
            onFocus={() => { setQ(""); setOpen(true); }}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoComplete="off"
            className={`${field} mt-1`}
            data-testid="de-product"
          />
          {open && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900" role="listbox" data-testid="de-product-list">
              {matches.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No product matches that.</li>}
              {matches.map((p) => {
                const inStock = Object.values(stock[p.key]?.conditions ?? {}).reduce((n, c) => n + c.onHand, 0);
                return (
                  <li key={p.key} role="option" aria-selected={p.key === l.productKey}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { props.onPickProduct(p); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-slate-800" data-testid="de-product-option">
                      <span><span className="block">{p.name}</span><span className="block text-xs text-slate-500">{p.brand}</span></span>
                      <span className={`shrink-0 text-xs font-semibold ${inStock ? "text-green-700 dark:text-green-300" : "text-slate-400"}`}>{inStock ? `${inStock} in stock` : "none in stock"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`de-cond-${rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Condition</label>
            <select id={`de-cond-${rid}`} value={l.condition} onChange={(e) => props.onCondition(e.target.value)} className={`${field} mt-1`} data-testid="de-cond">
              {condOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`de-group-${rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Dating</label>
            <select id={`de-group-${rid}`} value={l.groupKey ?? ""} onChange={(e) => { const g = avail?.groups.find((x) => x.key === e.target.value); props.onPatch({ groupKey: g ? g.key : null, groupLabel: g ? g.label : null }); }} className={`${field} mt-1`} data-testid="de-group" disabled={!avail}>
              <option value="">Any dating (earliest first)</option>
              {avail?.groups.map((g) => <option key={g.key} value={g.key}>{g.label} · {g.available} available</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`de-qty-${rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Quantity</label>
            <input id={`de-qty-${rid}`} inputMode="numeric" value={l.quantity} onChange={(e) => props.onPatch({ quantity: e.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1 ${over ? "!border-red-500" : ""}`} data-testid="de-qty" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`de-ndc-${rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">NDC</label>
            <input id={`de-ndc-${rid}`} value={l.ndc} onChange={(e) => props.onPatch({ ndc: e.target.value.replace(/[^\d-]/g, "").slice(0, 20) })} className={`${field} mt-1`} placeholder="00000-0000-00" data-testid="de-ndc" />
          </div>
          <div>
            <label htmlFor={`de-price-${rid}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Unit price ($)</label>
            <input id={`de-price-${rid}`} inputMode="decimal" value={l.unitPrice} onChange={(e) => props.onPatch({ unitPrice: cleanNum(e.target.value) })} className={`${field} mt-1`} data-testid="de-price" />
          </div>
          <div className="sm:col-span-2 self-end text-xs text-slate-500" data-testid="de-buyer-price">
            {props.buyerPrice != null ? (
              <>This buyer pays <strong>{fmtMoney(props.buyerPrice)}</strong> (price sheet){Number(l.unitPrice) !== props.buyerPrice && <button type="button" onClick={() => props.onPatch({ unitPrice: String(props.buyerPrice) })} className="ml-2 underline" data-testid="de-use-buyer-price">Use it</button>}</>
            ) : l.productKey ? "No price from this buyer's sheet." : ""}
          </div>
          <div className="self-end text-right">
            <p className="text-xs text-slate-500">Line total</p>
            <p className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid="de-line-total">{fmtMoney(lineAmount(qty, num(l.unitPrice)))}</p>
          </div>
        </div>
      </div>

      {/* The stock, on the side */}
      <aside className={`rounded-lg border p-3 text-sm ${over ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-slate-200 bg-stone-50 dark:border-slate-800 dark:bg-slate-950"}`} aria-label="Stock for this item" data-testid="de-stock">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">In stock</p>
        {!avail ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="de-stock-empty">Pick a product to see what you have.</p>
        ) : (
          <>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid="de-stock-onhand">{avail.onHand}</p>
            <p className="text-xs text-slate-500">{l.condition}{l.groupLabel ? `, ${l.groupLabel}` : ""} on hand</p>
            {avail.held > 0 && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300" data-testid="de-stock-held">{avail.held} held by other drafts</p>}
            <p className={`mt-1 text-sm font-semibold ${over ? "text-red-700 dark:text-red-300" : avail.available > 0 ? "text-green-700 dark:text-green-300" : "text-slate-500"}`} data-testid="de-stock-available">
              {avail.available} available to sell
            </p>
            {over && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300" data-testid="de-stock-over">{qty - avail.available} more than you can sell.</p>}
            {avail.groups.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300" data-testid="de-stock-groups">
                {avail.groups.map((g) => <li key={g.key} className="flex justify-between gap-2"><span>{g.label}</span><span className="tabular-nums">{g.available}</span></li>)}
              </ul>
            )}
            {avail.anyCondition.length > 1 && (
              <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-800">
                Other conditions: {avail.anyCondition.filter((c) => normKey(c.condition) !== normKey(l.condition)).map((c) => `${c.condition} ${c.onHand}`).join(", ")}
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
