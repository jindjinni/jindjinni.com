"use client";

// Step 6 body: the quotation receipt, what was quoted, and the received-items table
// (filled in like a quotation: product, quantity, condition, lot number, accept or return).

import { useEffect, useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { addReceivingItem } from "@/app/actions/receiving";
import type { CatalogProduct, PackagePhoto, QuotedLine } from "@/lib/receiving-queries";
import { CONDITION_OPTIONS, expirationMonth, suggestDisposition } from "@/lib/receiving-rules";
import { MONEY } from "@/lib/receiving-ui";
import { field } from "./intake-parts";
import { ItemDetailsPanel, type ItemState } from "./item-card";
import { ProductPicker } from "./product-picker";

const cell = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800";
const th = "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400";

const toInt = (s: string): number | null => (s.trim() !== "" && Number.isInteger(Number(s)) ? Number(s) : null);

export function receivedFor(items: ItemState[], quotedItemId: string): number | null {
  const rows = items.filter((i) => i.quotedItemId === quotedItemId);
  if (rows.length === 0 || rows.every((r) => toInt(r.quantityReceived) == null)) return null;
  return rows.reduce((a, r) => a + (toInt(r.quantityReceived) ?? 0), 0);
}

/** What was quoted: one row per quotation line, with how many have been entered as received so far. */
export function QuotedPanel({
  packageId,
  receipt,
  quotedLines,
  itemsText,
  orderTotal,
  items,
}: {
  packageId: string;
  receipt: { present: boolean; isImage: boolean };
  quotedLines: QuotedLine[];
  itemsText: string;
  orderTotal: number;
  items: ItemState[];
}) {
  const url = `/api/receiving/packages/${packageId}/quotation-receipt`;
  return (
    <div className="mt-3 space-y-4">
      <details open className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">Quotation / Invoice given to the customer</summary>
        <div className="mt-3">
          {receipt.present ? (
            <div className="space-y-2">
              {receipt.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Quotation receipt" loading="lazy" className="max-h-96 max-w-full rounded-lg border border-slate-200 dark:border-slate-700" />
              ) : (
                <iframe title="Quotation receipt" src={url} loading="lazy" className="h-[32rem] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
              )}
              <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-amber-800 underline dark:text-amber-300">
                Open in a new tab
              </a>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No receipt on file for this order.</p>
          )}
        </div>
      </details>

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Items quoted for this order</h3>
        {quotedLines.length === 0 ? (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{itemsText}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className={th}>Product</th>
                  <th className={th}>Condition</th>
                  <th className={th}>Expiration</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Unit price</th>
                  <th className={`${th} text-right`}>Line total</th>
                  <th className={th}>Received so far</th>
                </tr>
              </thead>
              <tbody>
                {quotedLines.map((l) => {
                  const got = receivedFor(items, l.id);
                  const diff = got == null ? null : got - l.quantity;
                  return (
                    <tr key={l.id} className="border-b border-slate-100 align-top dark:border-slate-800/70">
                      <td className="px-2 py-2">
                        <span className="font-medium text-slate-900 dark:text-slate-50">{l.name}</span>
                        {l.code && <span className="block text-xs text-slate-500">{l.code}</span>}
                      </td>
                      <td className="px-2 py-2">{l.condition ?? "—"}</td>
                      <td className="px-2 py-2">{l.expiration ?? "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{MONEY.format(l.unitPrice)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{MONEY.format(l.lineTotal)}</td>
                      <td className="px-2 py-2">
                        {got == null ? (
                          <span className="text-slate-400">Not entered</span>
                        ) : diff === 0 ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/40 dark:text-green-100">{got} · matches</span>
                        ) : (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
                            {got} · {diff! < 0 ? `short ${-diff!}` : `over ${diff}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Order total</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{MONEY.format(orderTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AddLine({ packageId, quotedLines, catalog, disabled, onError }: { packageId: string; quotedLines: QuotedLine[]; catalog: CatalogProduct[]; disabled: boolean; onError: (m: string) => void }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, startTransition] = useTransition();

  function add(input: { productId?: string; name?: string; quotedItemId?: string }) {
    onError("");
    startTransition(async () => {
      const res = await addReceivingItem(packageId, input);
      if (res.error) onError(res.error);
      else {
        setTyped("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-amber-400 p-3">
      {quotedLines.length > 0 && (
        <div className="mb-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Add another line for a quoted product (a second lot, another condition)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {quotedLines.map((l) => (
              <button key={l.id} type="button" disabled={disabled || busy} onClick={() => add({ quotedItemId: l.id })} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-amber-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-amber-950/30">
                + {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Something arrived that wasn&apos;t on the order? Pick it from the product list.</p>
      <div className="mt-2">
        <ProductPicker catalog={catalog} disabled={disabled || busy} onPick={(p) => add({ productId: p.id })} placeholder="Choose or type to search by name, code or NDC…" />
        <p className="mt-1 text-xs text-slate-500">If the product has an NDC on file, it fills in on the new line automatically.</p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="add-typed" className="text-xs font-medium text-slate-600 dark:text-slate-400">Not in the list? Type its name</label>
          <input id="add-typed" className={field} placeholder="Product name" value={typed} maxLength={160} disabled={disabled || busy} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <button type="button" disabled={disabled || busy || typed.trim().length < 2} onClick={() => add({ name: typed })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">
          Add as typed
        </button>
      </div>
    </div>
  );
}

/** The received-items table. One row per product line; the "Details" button opens the rest. */
export function ReceivedTable({
  packageId,
  items,
  flags,
  editable,
  quotedLines,
  catalog,
  photos,
  storageOk,
  onError,
  onPatchMany,
  onRemove,
}: {
  packageId: string;
  items: ItemState[];
  flags: boolean[];
  editable: boolean;
  quotedLines: QuotedLine[];
  catalog: CatalogProduct[];
  photos: PackagePhoto[];
  storageOk: boolean;
  onError: (m: string) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const quotedById = new Map(quotedLines.map((l) => [l.id, l]));

  const patch = (id: string, p: Partial<ItemState>) => onPatchMany({ [id]: p });

  function onQuantity(item: ItemState, value: string) {
    const updates: Record<string, Partial<ItemState>> = { [item.id]: { quantityReceived: value } };
    const n = toInt(value);
    // "Was received?" follows the count: nothing -> No, short of the quote -> Partially, otherwise Yes.
    const nextItems = items.map((i) => (i.id === item.id ? { ...i, quantityReceived: value } : i));
    if (item.quotedItemId && quotedById.has(item.quotedItemId)) {
      const q = quotedById.get(item.quotedItemId)!.quantity;
      const group = nextItems.filter((i) => i.quotedItemId === item.quotedItemId);
      if (group.every((g) => toInt(g.quantityReceived) != null)) {
        const sum = group.reduce((a, g) => a + (toInt(g.quantityReceived) ?? 0), 0);
        const status = sum === 0 ? "NO" : sum < q ? "PARTIALLY" : "YES";
        for (const g of group) {
          const mine = toInt(g.quantityReceived) ?? 0;
          updates[g.id] = { ...(updates[g.id] ?? {}), wasReceived: group.length > 1 && mine > 0 ? "YES" : status };
        }
        // the first row of a group carries the group's verdict when it holds the count
        const primary = group.find((g) => g.quotedQuantity != null);
        if (primary && group.length > 1) updates[primary.id] = { ...(updates[primary.id] ?? {}), wasReceived: status };
      }
    } else if (n != null) {
      updates[item.id] = { ...updates[item.id], wasReceived: n === 0 ? "NO" : "YES" };
    }
    // returning part of it follows the count
    if (item.needsReturn === "YES" && n != null) {
      const ret = toInt(item.quantityToReturn);
      if (ret == null || ret > n) updates[item.id] = { ...updates[item.id], quantityToReturn: String(n) };
    }
    onPatchMany(updates);
  }

  function onCondition(item: ItemState, value: string) {
    const p: Partial<ItemState> = { condition: value };
    if (!item.needsReturn) {
      const s = suggestDisposition(value);
      if (s) p.needsReturn = s;
    }
    patch(item.id, p);
  }

  function onDisposition(item: ItemState, value: string) {
    const p: Partial<ItemState> = { needsReturn: value };
    if (value === "YES") {
      if (item.quantityToReturn.trim() === "") p.quantityToReturn = item.quantityReceived.trim() !== "" ? item.quantityReceived : "";
      if (!item.returnStatus) p.returnStatus = "RETURN_REQUESTED";
      setOpen((o) => ({ ...o, [item.id]: true }));
    } else {
      p.quantityToReturn = "";
      p.returnStatus = "";
    }
    patch(item.id, p);
  }

  function onDate(item: ItemState, value: string) {
    const p: Partial<ItemState> = { expirationDate: value };
    if (!item.expirationEntryType || item.expirationEntryType === "NA") p.expirationEntryType = "SINGLE";
    patch(item.id, p);
  }

  const totalQty = items.reduce((a, i) => a + (toInt(i.quantityReceived) ?? 0), 0);

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Received items</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[62rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              <th className={th}>Product</th>
              <th className={th}>Qty received</th>
              <th className={th}>Condition</th>
              <th className={th}>Lot number</th>
              <th className={th}>NDC</th>
              <th className={th}>Expiration date</th>
              <th className={th}>Expiration (month)</th>
              <th className={th}>Needs to be returned?</th>
              <th className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No product lines yet. Add what arrived below.</td></tr>
            )}
            {items.map((it, idx) => {
              const q = it.quotedItemId ? quotedById.get(it.quotedItemId) : undefined;
              const notReceived = it.wasReceived === "NO";
              const multi = it.expirationEntryType === "RANGE" || it.expirationEntryType === "MULTIPLE";
              const firstLot = it.lots.map((l) => l.expirationDate).filter(Boolean).sort()[0] ?? "";
              const month = expirationMonth(multi ? firstLot : it.expirationDate);
              const isOpen = !!open[it.id];
              return (
                <Fragment key={it.id}>
                  <tr className={`border-b border-slate-100 align-top dark:border-slate-800/70 ${flags[idx] ? "bg-orange-50/60 dark:bg-orange-950/20" : ""}`}>
                    <td className="px-2 py-2">
                      <span className="font-medium text-slate-900 dark:text-slate-50">{it.productName}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {it.itemSource === "EXTRA" ? "Not on the order" : q ? `Quoted: ${q.quantity}${it.quotedQuantity == null ? " (another line)" : ""}` : ""}
                      </span>
                      {flags[idx] && <span className="mt-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">Flagged</span>}
                    </td>
                    <td className="w-24 px-2 py-2">
                      <input aria-label={`Quantity received, ${it.productName}`} id={`qty-${it.id}`} type="number" min={0} step={1} inputMode="numeric" className={`${cell} text-right tabular-nums`} disabled={!editable} value={it.quantityReceived} onChange={(e) => onQuantity(it, e.target.value)} />
                    </td>
                    <td className="w-40 px-2 py-2">
                      <select aria-label={`Condition, ${it.productName}`} id={`cond-${it.id}`} className={cell} disabled={!editable || notReceived} value={it.condition} onChange={(e) => onCondition(it, e.target.value)}>
                        <option value="">Choose…</option>
                        {CONDITION_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="w-40 px-2 py-2">
                      <input aria-label={`Lot number, ${it.productName}`} id={`lot-${it.id}`} className={cell} maxLength={60} placeholder="Lot #" disabled={!editable || notReceived} value={it.lotNumber} onChange={(e) => patch(it.id, { lotNumber: e.target.value })} />
                    </td>
                    <td className="w-40 px-2 py-2">
                      <input aria-label={`NDC, ${it.productName}`} id={`ndc-${it.id}`} className={cell} maxLength={40} placeholder="If applicable" disabled={!editable || notReceived} value={it.ndc} onChange={(e) => patch(it.id, { ndc: e.target.value })} />
                    </td>
                    <td className="w-40 px-2 py-2">
                      {multi ? (
                        <button type="button" onClick={() => setOpen((o) => ({ ...o, [it.id]: true }))} className="text-xs font-medium text-amber-800 underline dark:text-amber-300">
                          {it.expirationEntryType === "RANGE" ? "Date range" : "Several lots"} (see details)
                        </button>
                      ) : it.expirationEntryType === "NA" ? (
                        <span className="text-xs text-slate-500">No expiration</span>
                      ) : (
                        <input aria-label={`Expiration date, ${it.productName}`} id={`exp-${it.id}`} type="date" className={cell} disabled={!editable || notReceived} value={it.expirationDate} onChange={(e) => onDate(it, e.target.value)} />
                      )}
                    </td>
                    <td className="w-36 px-2 py-2 text-slate-700 dark:text-slate-200">{month || <span className="text-slate-400">—</span>}</td>
                    <td className="w-44 px-2 py-2">
                      <select aria-label={`Needs to be returned, ${it.productName}`} id={`ret-${it.id}`} className={cell} disabled={!editable || notReceived} value={it.needsReturn} onChange={(e) => onDisposition(it, e.target.value)}>
                        <option value="">Choose…</option>
                        <option value="NO">No, accept</option>
                        <option value="YES">Yes, return</option>
                        <option value="PENDING_REVIEW">Pending review</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [it.id]: !isOpen }))} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                        {isOpen ? "Hide details" : "Details"}
                      </button>
                      {editable && (
                        <button type="button" onClick={() => onRemove(it.id)} aria-label={`Remove ${it.productName}`} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-800 dark:border-slate-700">
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-slate-200 bg-stone-50/70 dark:border-slate-700 dark:bg-slate-950/40">
                      <td colSpan={9} className="px-3 py-4">
                        <ItemDetailsPanel item={it} editable={editable} onChange={(p) => patch(it.id, p)} packageId={packageId} photos={photos} storageOk={storageOk} onError={onError} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/60">
              <td className="px-2 py-2 text-xs text-slate-600 dark:text-slate-400">{items.length} {items.length === 1 ? "record" : "records"}</td>
              <td className="px-2 py-2 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">Sum {totalQty}</td>
              <td colSpan={7} />
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && <AddLine packageId={packageId} quotedLines={quotedLines} catalog={catalog} disabled={!editable} onError={onError} />}
    </div>
  );
}
