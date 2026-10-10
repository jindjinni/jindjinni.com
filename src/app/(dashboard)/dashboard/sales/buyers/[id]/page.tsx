import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { canWriteSales } from "@/lib/permissions";
import { getBuyer, getPriceSheet, listDocuments, listPriceItems, sellableProducts } from "@/lib/sales-service";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { shownStatus } from "@/lib/sales-rules";
import { StatusChip, fmtDay, fmtMoney } from "@/components/sales-ui";
import { BuyerForm } from "../buyer-form";
import { tabViewOf } from "@/lib/operations-service";
import { PriceSheetPanel, type PriceRow } from "./price-sheet-panel";

export const dynamic = "force-dynamic";

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  const { id } = await params;
  const buyer = await getBuyer(org.organizationId, id);
  if (!buyer) notFound();
  const canWrite = canWriteSales(org.role, org.access);
  const pharmacyFields = (await tabViewOf(org.organizationId)).sides.distribution;
  const [sheet, items, products, invoices, terms] = await Promise.all([
    getPriceSheet(org.organizationId, id),
    listPriceItems(org.organizationId, id),
    sellableProducts(org.organizationId),
    listDocuments(org.organizationId, "INVOICE"),
    getPaymentTerms(org.organizationId),
  ]);
  const today = todayIn(terms.timeZone);
  const byKey = new Map(products.map((p) => [p.key, p]));
  const rows: PriceRow[] = items.map((i) => {
    const p = i.productKey ? byKey.get(i.productKey) : null;
    return { id: i.id, rawName: i.rawName, productId: i.productId, productName: p?.name ?? "", brand: p?.brand ?? "", condition: i.condition, price: i.price };
  });
  const mine = invoices.filter((d) => d.buyerId === id).slice(0, 8);
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/dashboard/sales/buyers" className="text-sm text-slate-600 underline dark:text-slate-400">← All buyers</Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="buyer-title">{buyer.companyName}</h1>
        {canWrite && (
          <Link href={`/dashboard/sales/invoices/new?buyer=${buyer.id}`} className="mt-2 inline-block text-sm font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="buyer-new-invoice">Make an invoice for this buyer</Link>
        )}
      </div>
      <BuyerForm
        id={buyer.id}
        readOnly={!canWrite}
        pharmacyFields={pharmacyFields}
        initial={{
          companyName: buyer.companyName,
          contactName: buyer.contactName ?? "",
          email: buyer.email ?? "",
          phone: buyer.phone ?? "",
          billingAddress: buyer.billingAddress ?? "",
          shippingAddress: buyer.shippingAddress ?? "",
          paymentTerms: buyer.paymentTerms ?? "",
          taxInfo: buyer.taxInfo ?? "",
          taxExempt: buyer.taxExempt,
          defaultNotes: buyer.defaultNotes ?? "",
          ncpdp: buyer.ncpdp ?? "",
          npi: buyer.npi ?? "",
          active: buyer.active,
        }}
      />
      <PriceSheetPanel buyerId={buyer.id} canWrite={canWrite} sheet={sheet ? { fileName: sheet.fileName, uploadedAt: sheet.updatedAt } : null} rows={rows} products={products.map((p) => ({ id: p.id, name: p.name, brand: p.brand }))} />
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent invoices</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400" data-testid="buyer-no-invoices">No invoices for this buyer yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {mine.map((d) => (
              <li key={d.id}>
                <Link href={`/dashboard/sales/invoices/${d.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50 dark:hover:bg-slate-800/50" data-testid="buyer-invoice-row">
                  <span className="font-semibold tabular-nums">#{d.number}</span>
                  <span className="text-slate-500">{fmtDay(d.docDate)}</span>
                  <StatusChip status={shownStatus(d, today)} />
                  <span className="ml-auto tabular-nums">{fmtMoney(d.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
