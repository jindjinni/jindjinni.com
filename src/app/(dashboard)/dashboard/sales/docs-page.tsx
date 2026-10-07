import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { canWriteSales } from "@/lib/permissions";
import { listDocuments } from "@/lib/sales-service";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { balanceOf, shownStatus } from "@/lib/sales-rules";
import { DocList, type DocRow } from "./doc-list";

// The list page of quotations or invoices (the two screens only differ by kind).
export async function DocsPage({ kind }: { kind: "QUOTATION" | "INVOICE" }) {
  const org = await requireOrg();
  const [docs, terms] = await Promise.all([listDocuments(org.organizationId, kind), getPaymentTerms(org.organizationId)]);
  const today = todayIn(terms.timeZone);
  const rows: DocRow[] = docs.map((d) => ({
    id: d.id,
    number: d.number,
    buyer: d.buyerCompany ?? "",
    date: d.docDate,
    due: d.dueDate ?? "",
    total: d.total,
    balance: d.kind === "INVOICE" && d.status !== "VOID" && d.status !== "DRAFT" ? balanceOf(d) : 0,
    status: shownStatus(d, today),
    units: 0,
  }));
  const base = kind === "INVOICE" ? "/dashboard/sales/invoices" : "/dashboard/sales/quotations";
  const isInvoice = kind === "INVOICE";
  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{isInvoice ? "Invoices" : "Quotations"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {isInvoice
              ? "Invoices to your buyers. A draft holds its units; sending it takes them out of Inventory."
              : "Prices you offer a buyer before they order. A quotation doesn't touch Inventory; when the buyer says yes, make it into an invoice."}
          </p>
        </div>
        {canWriteSales(org.role, org.access) && (
          <Link href={`${base}/new`} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" data-testid="doc-new">
            + New {isInvoice ? "invoice" : "quotation"}
          </Link>
        )}
      </div>
      <DocList kind={kind} base={base} rows={rows} />
    </div>
  );
}
