import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { getInvoiceWithLines, getProducts, getConditions } from "@/lib/queries";
import { removeLineItem, finalizeInvoice, voidInvoice } from "@/app/actions/invoices";
import { AddLineItemForm } from "./add-line-item-form";
import { InvoiceActionButton } from "./invoice-action-button";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  FINALIZED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  VOID: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireOrg();

  const [data, products, conditions] = await Promise.all([
    getInvoiceWithLines(org.organizationId, id),
    getProducts(org.organizationId),
    getConditions(org.organizationId),
  ]);
  if (!data) notFound();

  const { invoice, buyer, lines } = data;
  const isDraft = invoice.status === "DRAFT";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Invoice {invoice.invoiceNumber ?? invoice.id}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {buyer?.companyName ?? "No buyer"} · {invoice.invoiceDate ?? "no date"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusStyles[invoice.status]}`}
        >
          {invoice.status}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Condition</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="px-4 py-3 text-right font-medium">Line total</th>
              {isDraft && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={isDraft ? 6 : 5} className="px-4 py-8 text-center text-slate-400">
                  No line items yet.
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr
                key={line.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{line.productName}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{line.conditionName}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {line.quantity}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  ${line.unitPrice.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${(line.quantity * line.unitPrice).toFixed(2)}
                </td>
                {isDraft && (
                  <td className="px-4 py-3 text-right">
                    <InvoiceActionButton
                      action={removeLineItem.bind(null, line.id)}
                      label="Remove"
                      pendingLabel="Removing..."
                      className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={isDraft ? 4 : 4} className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                ${invoice.total.toFixed(2)}
              </td>
              {isDraft && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {isDraft && products.length > 0 && conditions.length > 0 && (
        <AddLineItemForm invoiceId={invoice.id} products={products} conditions={conditions} />
      )}

      <div className="mt-6 flex items-center gap-4">
        {isDraft && (
          <InvoiceActionButton
            action={finalizeInvoice.bind(null, invoice.id)}
            label="Finalize invoice"
            pendingLabel="Finalizing..."
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            confirm="Finalize this invoice? This deducts the lines above from inventory and locks the invoice."
          />
        )}
        {invoice.status === "FINALIZED" && (
          <InvoiceActionButton
            action={voidInvoice.bind(null, invoice.id)}
            label="Void invoice"
            pendingLabel="Voiding..."
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            confirm="Void this invoice? This returns every unit it deducted back to inventory. The invoice stays in history marked VOID."
          />
        )}
      </div>
    </div>
  );
}
