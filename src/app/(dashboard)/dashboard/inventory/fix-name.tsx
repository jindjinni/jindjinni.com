"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fixProductNameAction, setProductBrandAction } from "@/app/actions/inventory";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type CatalogChoice = { id: string; key: string; name: string; brand: string };

/**
 * "Fix name" on a product in Live Stock: pick the correct product from the company's list (or type a name for something that isn't
 * on the list) and every unit of this product moves to it. Quantities, dating, lots and costs stay exactly as they are.
 */
export function FixName({ productKey, productName, units, catalog }: { productKey: string; productName: string; units: number; catalog: CatalogChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<CatalogChoice | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog.filter((c) => c.key !== productKey && (!needle || `${c.name} ${c.brand}`.toLowerCase().includes(needle))).slice(0, 40);
  }, [catalog, q, productKey]);
  const target = typing ? typed.trim() : picked?.name ?? "";

  function save() {
    setMsg(null);
    start(async () => {
      const r = await fixProductNameAction({ fromKey: productKey, productId: typing ? null : picked?.id ?? null, name: typing ? typed : null });
      if (r.error) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Done." });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="ml-4 mt-1 inline-block text-sm font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="fn-open">Fix name</button>
        {msg?.ok && <span className="ml-3 text-sm text-emerald-800 dark:text-emerald-300" data-testid="fn-done">{msg.text}</span>}
      </>
    );
  }
  return (
    <div className={`${card} mt-2 space-y-3`} data-testid="fn-panel">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Fix the name of &ldquo;{productName}&rdquo;</h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">Choose what this product really is. All {units.toLocaleString("en-US")} {units === 1 ? "unit" : "units"} move to it with the same quantities, expiration dates, lots and costs. This is recorded in the movements history.</p>
      </div>
      {!typing ? (
        <div className="space-y-2">
          <label htmlFor={`fn-q-${productKey}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Correct product</label>
          <input id={`fn-q-${productKey}`} value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="Search your product list" className={`${field} sm:w-80`} autoComplete="off" data-testid="fn-search" />
          <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800" data-testid="fn-list">
            {matches.length === 0 && <li className="px-3 py-2 text-slate-500">No product matches that.</li>}
            {matches.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setPicked(c)} className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-slate-800 ${picked?.id === c.id ? "bg-emerald-50 font-semibold dark:bg-emerald-950/40" : ""}`} data-testid="fn-option" aria-pressed={picked?.id === c.id}>
                  <span>{c.name}</span>
                  <span className="text-xs text-slate-500">{c.brand}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setTyping(true)} className="text-xs text-slate-600 underline dark:text-slate-400" data-testid="fn-type-toggle">It isn&apos;t on my product list: type the name</button>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor={`fn-t-${productKey}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Correct name</label>
          <input id={`fn-t-${productKey}`} value={typed} onChange={(e) => setTyped(e.target.value)} className={`${field} sm:w-80`} data-testid="fn-typed" />
          <button type="button" onClick={() => setTyping(false)} className="text-xs text-slate-600 underline dark:text-slate-400">Choose from my product list instead</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !target} onClick={save} className={primaryBtn} data-testid="fn-save">{pending ? "Moving…" : target ? `Rename to ${target}` : "Rename"}</button>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className={ghostBtn}>Cancel</button>
        {msg && !msg.ok && <span className="text-sm text-red-700 dark:text-red-300" data-testid="fn-error">{msg.text}</span>}
      </div>
    </div>
  );
}

/**
 * "Change brand" on a product in Live Stock: file the product under the right brand (category), picked from the brands already in use
 * or typed. No units move; it is one label on the product, and "Put it back" returns it to the brand it came in with.
 */
export function FixBrand({ productKey, productName, brand, brands }: { productKey: string; productName: string; brand: string; brands: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const choices = brands.filter((b) => b.toLowerCase() !== brand.toLowerCase());

  function run(next: string) {
    setErr(null);
    start(async () => {
      const r = await setProductBrandAction({ productKey, brand: next, knownBrands: brands });
      if (r.error) return setErr(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="ml-4 mt-1 inline-block text-sm font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="fb-open">Change brand</button>;
  return (
    <div className={`${card} mt-2 space-y-3`} data-testid="fb-panel">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Which brand does &ldquo;{productName}&rdquo; belong under?</h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">It is filed under <strong>{brand}</strong> now. Choose the right brand (or type a new one). The units don&apos;t move and Receiving isn&apos;t changed; only where it is listed.</p>
      </div>
      <div>
        <label htmlFor={`fb-${productKey}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Correct brand</label>
        <input id={`fb-${productKey}`} list={`fb-list-${productKey}`} value={value} onChange={(e) => setValue(e.target.value)} className={`${field} mt-1 sm:w-80`} autoComplete="off" data-testid="fb-input" />
        <datalist id={`fb-list-${productKey}`}>{choices.map((b) => <option key={b} value={b} />)}</datalist>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !value.trim()} onClick={() => run(value)} className={primaryBtn} data-testid="fb-save">{pending ? "Saving…" : value.trim() ? `File under ${value.trim()}` : "File under…"}</button>
        <button type="button" disabled={pending} onClick={() => run("")} className={ghostBtn} data-testid="fb-reset">Put it back where it came in</button>
        <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>Cancel</button>
        {err && <span className="text-sm text-red-700 dark:text-red-300" data-testid="fb-error">{err}</span>}
      </div>
    </div>
  );
}
