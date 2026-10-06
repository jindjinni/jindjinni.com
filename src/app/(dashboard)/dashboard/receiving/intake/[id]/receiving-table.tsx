"use client";

// Step 6 body, built like the Airtable "Received Items" grid: the quotation picture on top, then a spreadsheet of
// what actually arrived. Rows start empty; "Add record" (or the "+" under the grid) adds one, and the "+" in a row's
// Product cell opens a searchable product list. Picking a product fills in its NDC. Lot Number is the one added column.

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addReceivingItem, setReceivingItemProduct } from "@/app/actions/receiving";
import type { CatalogProduct, PackagePhoto, QuotedLine } from "@/lib/receiving-queries";
import { CONDITION_OPTIONS, expirationMonth, formatDateUS, parseDateInput, suggestDisposition } from "@/lib/receiving-rules";
import { ItemDetailsPanel, type ItemState } from "./item-card";

const toInt = (s: string): number | null => (s.trim() !== "" && Number.isInteger(Number(s)) ? Number(s) : null);

/** "Quotation / Invoice Photo (from Order)": the receipt given to the customer, shown inline. */
export function ReceiptPreview({ packageId, receipt }: { packageId: string; receipt: { present: boolean; isImage: boolean } }) {
  const url = `/api/receiving/packages/${packageId}/quotation-receipt`;
  if (!receipt.present) return <p className="text-sm text-slate-500">No receipt on file for this order.</p>;
  return (
    <div className="space-y-2">
      {receipt.isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Quotation receipt" loading="lazy" className="max-h-96 max-w-full rounded-lg border border-slate-200 dark:border-slate-700" />
      ) : (
        <iframe title="Quotation receipt" src={url} loading="lazy" className="h-[32rem] w-full max-w-2xl rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-amber-800 underline dark:text-amber-300">
        Open in a new tab
      </a>
    </div>
  );
}

/**
 * "Was it received?" follows the count: nothing -> No, short of the quote -> Partially, otherwise Yes.
 * Rows of one quoted product (two lots) are judged together. Pure: returns the changes, applies nothing.
 */
function receivedUpdates(items: ItemState[], quotedById: Map<string, QuotedLine>, itemId: string): Record<string, Partial<ItemState>> {
  const item = items.find((i) => i.id === itemId);
  const updates: Record<string, Partial<ItemState>> = {};
  if (!item) return updates;
  const n = toInt(item.quantityReceived);
  const q = item.quotedItemId ? quotedById.get(item.quotedItemId) : undefined;
  if (n == null) {
    updates[item.id] = { wasReceived: "" };
    return updates;
  }
  if (q) {
    const group = items.filter((i) => i.quotedItemId === item.quotedItemId);
    if (group.every((g) => toInt(g.quantityReceived) != null)) {
      const sum = group.reduce((a, g) => a + (toInt(g.quantityReceived) ?? 0), 0);
      const status = sum === 0 ? "NO" : sum < q.quantity ? "PARTIALLY" : "YES";
      for (const g of group) {
        const mine = toInt(g.quantityReceived) ?? 0;
        updates[g.id] = { wasReceived: group.length > 1 && mine > 0 ? "YES" : status };
      }
      // the row that carries the quoted count carries the group's verdict
      const primary = group.find((g) => g.quotedQuantity != null);
      if (primary && group.length > 1) updates[primary.id] = { wasReceived: status };
    }
  } else {
    updates[item.id] = { wasReceived: n === 0 ? "NO" : "YES" };
  }
  return updates;
}

// ---- cells -------------------------------------------------------------------

const cellInput =
  "block h-9 w-full bg-transparent px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-sky-50 focus:ring-2 focus:ring-inset focus:ring-sky-500 disabled:text-slate-600 dark:text-slate-50 dark:focus:bg-sky-950/30";
const th = "border-b border-r border-slate-200 bg-white px-2 py-2 text-left align-bottom text-[13px] font-semibold leading-tight text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const td = "border-b border-r border-slate-200 p-0 align-middle dark:border-slate-700";

type PillOption = { value: string; label: string; cls: string };

/** A choice shown as a coloured pill; the real <select> sits invisibly on top so it works with keyboard and touch. */
function PillSelect({ id, label, value, options, onChange, disabled }: { id: string; label: string; value: string; options: PillOption[]; onChange: (v: string) => void; disabled: boolean }) {
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative flex h-9 items-center px-2 focus-within:bg-sky-50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-sky-500 dark:focus-within:bg-sky-950/30">
      {current ? <span className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-sm ${current.cls}`}>{current.label}</span> : <span className="text-sm text-slate-300 dark:text-slate-600">&nbsp;</span>}
      <select aria-label={label} id={id} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default">
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const CONDITION_CLS: Record<string, string> = {
  Mint: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  Dinged: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  "Minor Damage": "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  Stained: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  Opened: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  Unsealed: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  Damaged: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  Torn: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  Crushed: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  Expired: "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
  Other: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
};
const CONDITION_PILLS: PillOption[] = CONDITION_OPTIONS.map((c) => ({ value: c, label: c, cls: CONDITION_CLS[c] ?? CONDITION_CLS.Other }));
const RETURN_PILLS: PillOption[] = [
  { value: "YES", label: "Yes", cls: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" },
  { value: "NO", label: "No", cls: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" },
  { value: "PENDING_REVIEW", label: "Pending Review", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
];

/** A date typed like Airtable shows it (8/20/2027). Saved as a real date when you leave the cell; stays red until it is one. */
function DateCell({ id, label, value, disabled, onCommit }: { id: string; label: string; value: string; disabled: boolean; onCommit: (iso: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  return (
    <input
      id={id}
      aria-label={label}
      aria-invalid={bad}
      inputMode="numeric"
      autoComplete="off"
      placeholder="M/D/YYYY"
      maxLength={10}
      disabled={disabled}
      value={draft ?? formatDateUS(value)}
      title={bad ? "Type the date like 8/20/2027" : undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        setBad(false);
      }}
      onBlur={() => {
        if (draft === null) return;
        const t = draft.trim();
        if (t === "") {
          onCommit("");
          setDraft(null);
          return;
        }
        const iso = parseDateInput(t);
        if (iso) {
          onCommit(iso);
          setDraft(null);
        } else setBad(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${cellInput} tabular-nums ${bad ? "bg-red-50 ring-2 ring-inset ring-red-500 dark:bg-red-950/30" : ""}`}
    />
  );
}

// ---- the product cell: "+" -> searchable list --------------------------------

type Pos = { left: number; width: number; maxH: number; top?: number; bottom?: number };
type Choice = { productId?: string; name?: string };

// "Name (CODE)"; many catalog names already carry the code, so it isn't repeated.
const productLabel = (p: CatalogProduct) => (p.productCode && !p.name.toLowerCase().includes(p.productCode.toLowerCase()) ? `${p.name} (${p.productCode})` : p.name);

function ProductPopup({ catalog, pos, popRef, onChoose, onClose }: { catalog: CatalogProduct[]; pos: Pos; popRef: React.RefObject<HTMLDivElement | null>; onChoose: (c: Choice) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out: CatalogProduct[] = [];
    for (const p of catalog) {
      if (toks.length) {
        const hay = `${p.name} ${p.productCode ?? ""} ${p.ndc ?? ""} ${p.brand}`.toLowerCase();
        if (!toks.every((t) => hay.includes(t))) continue;
      }
      out.push(p);
      if (out.length >= 80) break;
    }
    return out;
  }, [catalog, q]);

  const typed = q.trim();
  const offerTyped = typed.length >= 2 && !matches.some((m) => m.name.toLowerCase() === typed.toLowerCase());
  const count = matches.length + (offerTyped ? 1 : 0);
  const at = Math.min(active, Math.max(0, count - 1));

  useEffect(() => {
    (listRef.current?.children[at] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  function pickIndex(i: number) {
    if (i < matches.length) onChoose({ productId: matches[i].id });
    else if (offerTyped) onChoose({ name: typed });
  }

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Choose a product"
      style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
      className="z-50 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 p-2 dark:border-slate-700">
        <input
          autoFocus
          aria-label="Search products"
          placeholder="Search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(at + 1, count - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(at - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (count > 0) pickIndex(at);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900"
        />
      </div>
      <ul ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
        {matches.map((p, i) => (
          <li
            key={p.id}
            role="option"
            aria-selected={i === at}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onChoose({ productId: p.id });
            }}
            className={`cursor-pointer rounded-md px-3 py-2 text-sm ${i === at ? "bg-slate-100 dark:bg-slate-800" : ""}`}
          >
            {productLabel(p)}
          </li>
        ))}
        {offerTyped && (
          <li
            role="option"
            aria-selected={at === matches.length}
            onMouseEnter={() => setActive(matches.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              onChoose({ name: typed });
            }}
            className={`cursor-pointer rounded-md px-3 py-2 text-sm text-slate-600 dark:text-slate-300 ${at === matches.length ? "bg-slate-100 dark:bg-slate-800" : ""}`}
          >
            Not in the list? Use &ldquo;{typed}&rdquo; as typed
          </li>
        )}
        {count === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching products. Type the name to add it as typed.</li>}
      </ul>
    </div>
  );
}

function ProductCell({ item, catalog, editable, busy, autoOpen, recall, onChoose }: { item: ItemState; catalog: CatalogProduct[]; editable: boolean; busy: boolean; autoOpen: boolean; recall?: "RECALLED" | "CHECKED"; onChoose: (c: Choice) => void }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const autoDone = useRef(false);

  function openAt(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const width = Math.min(480, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const useBelow = below >= 280 || below >= above;
    const maxH = Math.max(200, Math.min(400, useBelow ? below : above));
    setPos(useBelow ? { left, width, maxH, top: r.bottom + 4 } : { left, width, maxH, bottom: window.innerHeight - r.top + 4 });
  }

  // A row that was just added opens its product list straight away.
  const setBtn = (el: HTMLButtonElement | null) => {
    btnRef.current = el;
    if (el && autoOpen && !autoDone.current) {
      autoDone.current = true;
      queueMicrotask(() => openAt(el));
    }
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const scroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const has = item.productName.trim() !== "";
  return (
    <div className="flex h-9 min-w-0 items-center px-1.5">
      {editable ? (
        <button
          ref={setBtn}
          type="button"
          disabled={busy}
          aria-haspopup="dialog"
          aria-expanded={!!pos}
          aria-label={has ? `Product: ${item.productName}. Change product` : "Choose a product"}
          onClick={(e) => (pos ? setPos(null) : openAt(e.currentTarget))}
          className={
            has
              ? "max-w-full truncate rounded bg-sky-100 px-2 py-1 text-left text-sm text-sky-950 hover:bg-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-60 dark:bg-sky-900/40 dark:text-sky-50 dark:hover:bg-sky-900/60"
              : "flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-base leading-none text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          }
        >
          {has ? item.productName : "+"}
        </button>
      ) : has ? (
        <span className="max-w-full truncate rounded bg-sky-100 px-2 py-1 text-sm text-sky-950 dark:bg-sky-900/40 dark:text-sky-50">{item.productName}</span>
      ) : null}
      {recall === "RECALLED" && (
        <span title="On a recall list. Marked for return." className="ml-1.5 shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Recall</span>
      )}
      {recall === "CHECKED" && (
        <span title="Recall-checked: not on the lists we have loaded." className="ml-1.5 shrink-0 rounded border border-slate-300 px-1 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Checked</span>
      )}
      {pos &&
        createPortal(
        <ProductPopup
          catalog={catalog}
          pos={pos}
          popRef={popRef}
          onClose={() => {
            setPos(null);
            btnRef.current?.focus();
          }}
          onChoose={(c) => {
            setPos(null);
            onChoose(c);
          }}
        />,
        document.body,
      )}
    </div>
  );
}

// ---- the grid ------------------------------------------------------------------

export function ReceivedItemsGrid({
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
  onRemoveMany,
  recallStates,
  onScanRow,
  onNumbersRow,
  numberCounts,
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
  onRemoveMany: (ids: string[]) => void;
  /** Recall-check result per row id (rows never checked are absent). */
  recallStates?: Record<string, "RECALLED" | "CHECKED">;
  /** Opens the scan dialog for a row (the scan button in its Lot Number cell). */
  onScanRow?: (itemId: string) => void;
  /** Opens the Lot & serial numbers tab on this product. */
  onNumbersRow?: (itemId: string) => void;
  /** Lots and serials already recorded per product line. */
  numberCounts?: Record<string, { lots: number; serials: number }>;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const quotedById = new Map(quotedLines.map((l) => [l.id, l]));
  const patch = (id: string, p: Partial<ItemState>) => onPatchMany({ [id]: p });
  const selectedIds = items.filter((i) => selected[i.id]).map((i) => i.id);

  function addRecord() {
    onError("");
    startTransition(async () => {
      const res = await addReceivingItem(packageId, { blank: true });
      if (res.error) return onError(res.error);
      setJustAdded(res.id ?? null);
      router.refresh();
    });
  }

  function chooseProduct(item: ItemState, c: Choice) {
    onError("");
    startTransition(async () => {
      const res = await setReceivingItemProduct(packageId, item.id, c);
      if (res.error || !res.item) return onError(res.error ?? "Couldn't set the product.");
      // Follow the server: the product, its NDC, and how every row now lines up with the quotation.
      const updates: Record<string, Partial<ItemState>> = {};
      for (const [id, link] of Object.entries(res.quoted ?? {})) updates[id] = { ...link };
      updates[item.id] = { ...updates[item.id], productId: res.item.productId, productName: res.item.productName, ndc: res.item.ndc };
      const merged = items.map((i) => (updates[i.id] ? { ...i, ...updates[i.id] } : i));
      const target = merged.find((i) => i.id === item.id);
      if (target && toInt(target.quantityReceived) != null) {
        for (const [id, u] of Object.entries(receivedUpdates(merged, quotedById, item.id))) updates[id] = { ...updates[id], ...u };
      }
      onPatchMany(updates);
      router.refresh();
    });
  }

  function onQuantity(item: ItemState, value: string) {
    const nextItems = items.map((i) => (i.id === item.id ? { ...i, quantityReceived: value } : i));
    const updates = receivedUpdates(nextItems, quotedById, item.id);
    updates[item.id] = { ...updates[item.id], quantityReceived: value };
    // returning part of it follows the count
    const n = toInt(value);
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
  const allSelected = items.length > 0 && items.every((i) => selected[i.id]);
  const COLS = 9;

  const plus: ReactNode = (
    <span aria-hidden className="text-lg leading-none">
      +
    </span>
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Received Items</h3>
        {editable && (
          <div className="flex items-center gap-2">
            {editable && selectedIds.length === 0 && items.length > 0 && <span className="hidden text-xs text-slate-500 sm:inline">Tick a row to delete it, or use the trash icon.</span>}
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onRemoveMany(selectedIds);
                  setSelected({});
                }}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-200"
              >
                Delete {selectedIds.length === 1 ? "selected row" : `${selectedIds.length} selected rows`}
              </button>
            )}
            <button type="button" onClick={addRecord} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
              Add record
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto border-l border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full min-w-[77.5rem] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col style={{ width: "7.25rem" }} />
            <col style={{ width: "15rem" }} />
            <col style={{ width: "8.5rem" }} />
            <col style={{ width: "6.5rem" }} />
            <col style={{ width: "8rem" }} />
            <col style={{ width: "7.5rem" }} />
            <col style={{ width: "9.5rem" }} />
            <col style={{ width: "7.5rem" }} />
            <col style={{ width: "9rem" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-20`}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" aria-label="Select all records" disabled={!editable || items.length === 0} checked={allSelected} onChange={(e) => setSelected(e.target.checked ? Object.fromEntries(items.map((i) => [i.id, true])) : {})} />
                </span>
              </th>
              <th className={`${th} sticky left-[7.25rem] z-20`}>Product</th>
              <th className={th}>NDC</th>
              <th className={th}>Quantity Received</th>
              <th className={th}>Product Condition</th>
              <th className={th}>Lot Number</th>
              <th className={th}>Expiration Date</th>
              <th className={th}>Expiration (Month)</th>
              <th className={th}>Needs To Be Returned?</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const notReceived = it.wasReceived === "NO";
              const multi = it.expirationEntryType === "RANGE" || it.expirationEntryType === "MULTIPLE";
              const firstLot = it.lots.map((l) => l.expirationDate).filter(Boolean).sort()[0] ?? "";
              const month = expirationMonth(multi ? firstLot : it.expirationDate);
              const isOpen = !!open[it.id];
              const label = it.productName || "new record";
              return (
                <Fragment key={it.id}>
                  <tr className={flags[idx] && it.productName ? "bg-orange-50/50 dark:bg-orange-950/10" : ""}>
                    <td className={`${td} sticky left-0 z-10 bg-white dark:bg-slate-900`}>
                      <div className="flex h-9 items-center gap-2 px-2">
                        <input type="checkbox" aria-label={`Select ${label}`} disabled={!editable} checked={!!selected[it.id]} onChange={(e) => setSelected((s) => ({ ...s, [it.id]: e.target.checked }))} />
                        <span className="w-4 text-right text-xs tabular-nums text-slate-500">{idx + 1}</span>
                        <button type="button" aria-expanded={isOpen} aria-label={isOpen ? `Hide details for ${label}` : `Open details for ${label}`} onClick={() => setOpen((o) => ({ ...o, [it.id]: !isOpen }))} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50">
                          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            {isOpen ? <path d="M10 6l4-4M10 6h3M10 6V3M6 10l-4 4M6 10H3M6 10v3" /> : <path d="M9 2h5v5M14 2L9 7M7 14H2V9M2 14l5-5" />}
                          </svg>
                        </button>
                        {editable && (
                          <button type="button" aria-label={`Delete ${label}`} title="Delete this row" onClick={() => onRemoveMany([it.id])} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300">
                            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9h6.8L12 4M6.5 6.5v4M9.5 6.5v4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`${td} sticky left-[7.25rem] z-10 bg-white dark:bg-slate-900`}>
                      <ProductCell item={it} catalog={catalog} editable={editable} busy={busy} autoOpen={justAdded === it.id && !it.productName} recall={recallStates?.[it.id]} onChoose={(c) => chooseProduct(it, c)} />
                    </td>
                    <td className={td}>
                      <input aria-label={`NDC, ${label}`} id={`ndc-${it.id}`} className={cellInput} maxLength={40} disabled={!editable || notReceived} value={it.ndc} onChange={(e) => patch(it.id, { ndc: e.target.value })} />
                    </td>
                    <td className={td}>
                      <input aria-label={`Quantity Received, ${label}`} id={`qty-${it.id}`} type="number" min={0} step={1} inputMode="numeric" className={`${cellInput} text-right tabular-nums`} disabled={!editable} value={it.quantityReceived} onChange={(e) => onQuantity(it, e.target.value)} />
                    </td>
                    <td className={td}>
                      <PillSelect id={`cond-${it.id}`} label={`Product Condition, ${label}`} value={it.condition} options={CONDITION_PILLS} disabled={!editable || notReceived} onChange={(v) => onCondition(it, v)} />
                    </td>
                    <td className={td}>
                      <div className="flex items-center">
                        <input aria-label={`Lot Number, ${label}`} id={`lot-${it.id}`} className={cellInput} maxLength={60} disabled={!editable || notReceived} value={it.lotNumber} onChange={(e) => patch(it.id, { lotNumber: e.target.value })} />
                        {editable && onScanRow && it.productName.trim() && !notReceived && (
                          <button type="button" title="Scan the barcode or take a photo of the label" aria-label={`Scan lot number, ${label}`} onClick={() => onScanRow(it.id)} className="mr-1 shrink-0 rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:hover:bg-sky-950/40 dark:hover:text-sky-200">
                            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 5V3a1 1 0 011-1h2M11 2h2a1 1 0 011 1v2M14 11v2a1 1 0 01-1 1h-2M5 14H3a1 1 0 01-1-1v-2M4.5 5.5v5M7 5.5v5M9 5.5v5M11.5 5.5v5" />
                            </svg>
                          </button>
                        )}
                        {editable && onNumbersRow && it.productName.trim() && !notReceived && (
                          <button type="button" title="Enter or photograph the lot and serial numbers" aria-label={`Lot and serial numbers, ${label}`} onClick={() => onNumbersRow(it.id)} className="mr-1 shrink-0 rounded p-1.5 text-xs font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:hover:bg-sky-950/40 dark:hover:text-sky-200">
                            <span aria-hidden>#</span>
                          </button>
                        )}
                      </div>
                      {numberCounts && it.productName.trim() && !notReceived && (
                        <button type="button" onClick={() => onNumbersRow?.(it.id)} disabled={!onNumbersRow} className="mt-0.5 block text-left text-[11px] text-slate-500 underline-offset-2 hover:underline disabled:no-underline dark:text-slate-400">
                          {numberCounts[it.id] && numberCounts[it.id].serials + numberCounts[it.id].lots > 0 ? `${numberCounts[it.id].lots} lot${numberCounts[it.id].lots === 1 ? "" : "s"}, ${numberCounts[it.id].serials} serial${numberCounts[it.id].serials === 1 ? "" : "s"} recorded` : "Enter lot & serial numbers"}
                        </button>
                      )}
                    </td>
                    <td className={td}>
                      {multi ? (
                        <button type="button" onClick={() => setOpen((o) => ({ ...o, [it.id]: true }))} className="h-9 px-2 text-left text-xs font-medium text-amber-800 underline dark:text-amber-300">
                          {it.expirationEntryType === "RANGE" ? "Date range" : "Several lots"} (see details)
                        </button>
                      ) : (
                        <DateCell id={`exp-${it.id}`} label={`Expiration Date, ${label}`} value={it.expirationDate} disabled={!editable || notReceived} onCommit={(iso) => onDate(it, iso)} />
                      )}
                    </td>
                    <td className={`${td} px-2 text-slate-800 dark:text-slate-100`}>{month || <span className="text-slate-300 dark:text-slate-600">&nbsp;</span>}</td>
                    <td className={td}>
                      <PillSelect id={`ret-${it.id}`} label={`Needs To Be Returned, ${label}`} value={it.needsReturn} options={RETURN_PILLS} disabled={!editable || notReceived} onChange={(v) => onDisposition(it, v)} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={COLS} className="border-b border-r border-slate-200 bg-stone-50/70 px-3 py-4 dark:border-slate-700 dark:bg-slate-950/40">
                        <ItemDetailsPanel item={it} editable={editable} onChange={(p) => patch(it.id, p)} packageId={packageId} photos={photos} storageOk={storageOk} onError={onError} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {editable && (
              <tr>
                <td colSpan={COLS} className="border-b border-r border-slate-200 p-0 dark:border-slate-700">
                  <button type="button" onClick={addRecord} disabled={busy} aria-label="Add a record" className="sticky left-0 flex h-9 w-24 items-center justify-center bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:bg-slate-900 dark:hover:bg-slate-800">
                    {plus}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/60">
              <td colSpan={3} className="border-b border-r border-slate-200 px-2 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {items.length} {items.length === 1 ? "record" : "records"}
              </td>
              <td className="border-b border-r border-slate-200 px-2 py-2 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">Sum {totalQty}</td>
              <td colSpan={COLS - 4} className="border-b border-r border-slate-200 dark:border-slate-700" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
