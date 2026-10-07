import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { canWriteSales } from "@/lib/permissions";
import { listBuyers, listDocuments, listPriceItems } from "@/lib/sales-service";
import { BuyerList, type BuyerRow } from "./buyer-list";
import { ImportBuyersForm } from "./import-buyers-form";

export const dynamic = "force-dynamic";

// Buyers: the wholesale buyers invoices go to. Each carries its contact details, its payment terms and (optionally) its
// price sheet, which feeds the Price Comparison.
export default async function BuyersPage() {
  const org = await requireOrg();
  const [buyers, invoices, prices] = await Promise.all([listBuyers(org.organizationId), listDocuments(org.organizationId, "INVOICE"), listPriceItems(org.organizationId)]);
  const rows: BuyerRow[] = buyers.map((b) => {
    const mine = invoices.filter((i) => i.buyerId === b.id && i.status !== "VOID" && i.status !== "DRAFT");
    const owed = mine.reduce((n, i) => n + Math.max(0, i.total - i.amountPaid), 0);
    const items = prices.filter((p) => p.buyerId === b.id);
    return {
      id: b.id,
      name: b.companyName,
      contact: b.contactName ?? "",
      email: b.email ?? "",
      phone: b.phone ?? "",
      terms: b.paymentTerms ?? "",
      active: b.active,
      invoices: mine.length,
      invoiced: Math.round(mine.reduce((n, i) => n + i.total, 0) * 100) / 100,
      owed: Math.round(owed * 100) / 100,
      lastInvoice: mine[0]?.docDate ?? "",
      prices: items.length,
      unmatched: items.filter((p) => !p.productKey).length,
    };
  });
  const canWrite = canWriteSales(org.role);
  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Buyers</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            The wholesale buyers you invoice. Open a buyer to change its details or load its price sheet.
          </p>
        </div>
        {canWrite && (
          <Link href="/dashboard/sales/buyers/new" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" data-testid="buyer-new">
            + Add a buyer
          </Link>
        )}
      </div>
      <BuyerList rows={rows} />
      {canWrite && <ImportBuyersForm />}
    </div>
  );
}
