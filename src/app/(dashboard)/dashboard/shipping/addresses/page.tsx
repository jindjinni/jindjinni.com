import Link from "next/link";
import { listContacts } from "@/lib/shipping-contacts";
import { importPreview } from "@/lib/shipping-contacts";
import { addressReady, CONTACT_KINDS, kindLabel } from "@/lib/shipping-address-rules";
import { operationsOf } from "@/lib/operations-service";
import { wordsFor } from "@/lib/operations-rules";
import { requireShipping } from "../gate";
import { AddressManager, type ContactRow } from "./address-manager";

export const dynamic = "force-dynamic";

// Addresses: saved profiles for your pharmacies, wholesale buyers, sellers and suppliers. Used to fill in a shipment and make its label.
export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; hidden?: string }> }) {
  const { org, canWrite } = await requireShipping();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const hidden = sp.hidden === "1";
  const kind = CONTACT_KINDS.find((k) => k === sp.kind);
  const [list, preview, sides] = await Promise.all([listContacts(org.organizationId, { q, kind, hidden }), importPreview(org.organizationId), operationsOf(org.organizationId)]);
  const buyers = wordsFor(sides).buyers;
  const rows: ContactRow[] = list.map((c) => ({
    id: c.id, kind: c.kind, name: c.name, company: c.company ?? "", street1: c.street1 ?? "", street2: c.street2 ?? "", city: c.city ?? "", state: c.state ?? "", zip: c.zip ?? "",
    phone: c.phone ?? "", email: c.email ?? "", isResidential: c.isResidential, notes: c.notes ?? "", hidden: !!c.hiddenAt, fromSource: !!c.sourceKind,
    ready: addressReady({ name: c.name, company: c.company, street1: c.street1, city: c.city, state: c.state, zip: c.zip }),
  }));
  const tab = (label: string, k?: string) => (
    <Link key={label} href={`/dashboard/shipping/addresses?${new URLSearchParams({ ...(q ? { q } : {}), ...(k ? { kind: k } : {}), ...(hidden ? { hidden: "1" } : {}) })}`} className={`rounded-full px-3 py-1 text-xs font-medium ${kind === k ? "bg-emerald-700 text-white" : "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300"}`}>{label}</Link>
  );
  return (
    <div className="max-w-5xl" data-testid="addresses-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Addresses</h1>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Saved addresses for your {buyers.toLowerCase()}, sellers and suppliers. Pick one when you ship an order or send a return, and the label fills in by itself.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab("All")}
        {CONTACT_KINDS.map((k) => tab(kindLabel(k, buyers), k))}
        <Link href={`/dashboard/shipping/addresses?${new URLSearchParams({ ...(q ? { q } : {}), ...(kind ? { kind } : {}), ...(hidden ? {} : { hidden: "1" }) })}`} className="ml-auto text-xs text-slate-500 underline">{hidden ? "Show active" : "Show hidden"}</Link>
      </div>
      <form className="mb-4 flex gap-2" role="search">
        {kind && <input type="hidden" name="kind" value={kind} />}
        {hidden && <input type="hidden" name="hidden" value="1" />}
        <label htmlFor="addr-q" className="sr-only">Search addresses</label>
        <input id="addr-q" name="q" defaultValue={q} placeholder="Search by name, city, ZIP or email" className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="addr-search" />
        <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Search</button>
      </form>
      <AddressManager rows={rows} canWrite={canWrite} preview={preview} words={{ buyers: buyers.endsWith("s") ? buyers.slice(0, -1) : buyers }} />
    </div>
  );
}
