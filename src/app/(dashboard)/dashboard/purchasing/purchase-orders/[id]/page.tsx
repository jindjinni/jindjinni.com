import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogItems, getPurchaseOrder, listSuppliers } from "@/lib/purchase-order-service";
import { LICENSE_WARNING, isPoStatus, licenseState, money, usDate } from "@/lib/purchase-order-rules";
import { PoEditor, type EditorInitial } from "../po-editor";
import { PoActions } from "../po-actions";
import { PoStatusChip } from "../po-list";
import { requirePoPage } from "../gate";
import { card } from "@/components/sales-ui";

export const dynamic = "force-dynamic";

const dt = "text-xs font-medium uppercase tracking-wide text-slate-500";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, canWrite, today } = await requirePoPage();
  const { id } = await params;
  const have = await getPurchaseOrder(org.organizationId, id);
  if (!have) notFound();
  const { po, lines } = have;
  const status = isPoStatus(po.status) ? po.status : "DRAFT";
  const editable = status === "DRAFT" && canWrite;

  let editor = null;
  if (editable) {
    const [suppliers, catalog] = await Promise.all([listSuppliers(org.organizationId), catalogItems(org.organizationId)]);
    const initial: EditorInitial = {
      supplierId: po.supplierId ?? "",
      supplierName: po.supplierName,
      supplierAddress: po.supplierAddress ?? "",
      supplierEmail: po.supplierEmail ?? "",
      supplierLicense: po.supplierLicense ?? "",
      supplierLicenseExpires: po.supplierLicenseExpires ?? "",
      issueDate: po.issueDate,
      shipToName: po.shipToName ?? "",
      shipToAddress: po.shipToAddress ?? "",
      billToName: po.billToName ?? "",
      billToAddress: po.billToAddress ?? "",
      reference: po.reference ?? "",
      comments: po.comments ?? "",
      terms: po.terms ?? "",
      shipping: po.shipping ? String(po.shipping) : "",
      lines: lines.map((l) => ({ productId: l.productId, partNumber: l.partNumber ?? "", ndc: l.ndc ?? "", name: l.name, size: l.size ?? "", quantity: String(l.quantity), unit: l.unit, unitCost: String(l.unitCost) })),
    };
    editor = (
      <PoEditor
        docId={po.id}
        number={po.poNumber}
        initial={initial}
        today={today}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email ?? "", address: s.address ?? "", license: s.licenseNumber ?? "", licenseExpires: s.licenseExpires ?? "" }))}
        catalog={catalog}
      />
    );
  }
  const lic = licenseState(po.supplierLicenseExpires, today);

  return (
    <div className="max-w-5xl space-y-5" data-testid="po-detail" data-status={status}>
      <div>
        <p className="text-sm"><Link href="/dashboard/purchasing/purchase-orders" className="text-emerald-800 underline dark:text-emerald-300">Purchase Orders</Link></p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="po-number">{po.poNumber}</h1>
          <PoStatusChip status={status} />
          <span className="text-sm text-slate-500">to {po.supplierName} · {usDate(po.issueDate)}</span>
        </div>
      </div>

      <PoActions id={po.id} number={po.poNumber} status={status} supplierEmail={po.supplierEmail ?? ""} emailedTo={po.emailedTo} canWrite={canWrite} />

      {editor ?? (
        <div className={`${card} space-y-4`} data-testid="po-readonly">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className={dt}>Supplier</p>
              <p className="mt-1 text-sm font-semibold">{po.supplierName}</p>
              <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{po.supplierAddress}</p>
              {po.supplierLicense && <p className="mt-1 text-sm">License {po.supplierLicense}{po.supplierLicenseExpires ? `, expires ${usDate(po.supplierLicenseExpires)}` : ""}</p>}
              {status !== "RECEIVED" && status !== "CANCELLED" && LICENSE_WARNING[lic] && <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">{LICENSE_WARNING[lic]}</p>}
            </div>
            <div>
              <p className={dt}>Ship to / Bill to</p>
              <p className="mt-1 text-sm"><strong>{po.shipToName}</strong></p>
              <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{po.shipToAddress}</p>
              {po.billToAddress !== po.shipToAddress && <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300"><strong>Bill to: </strong>{po.billToName}{"\n"}{po.billToAddress}</p>}
            </div>
          </div>
          {(po.reference || po.comments) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className={dt}>Reference</p><p className="mt-1 text-sm">{po.reference}</p></div>
              <div><p className={dt}>Comments</p><p className="mt-1 whitespace-pre-line text-sm">{po.comments}</p></div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="po-lines">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3">Part number</th><th className="py-2 pr-3">NDC</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3">Unit</th><th className="py-2 pr-3 text-right">Net cost</th><th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800" data-testid="po-line-row">
                    <td className="py-2 pr-3">{l.partNumber}</td><td className="py-2 pr-3 tabular-nums">{l.ndc}</td><td className="py-2 pr-3">{l.name}</td><td className="py-2 pr-3">{l.size}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.quantity}</td><td className="py-2 pr-3">{l.unit}</td><td className="py-2 pr-3 text-right tabular-nums">{money(l.unitCost)}</td><td className="py-2 text-right font-semibold tabular-nums">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total</span><span className="tabular-nums">{money(po.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Shipping</span><span className="tabular-nums">{money(po.shipping)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold dark:border-slate-700"><span>Grand total</span><span className="tabular-nums" data-testid="po-grand-total">{money(po.total)}</span></div>
          </div>
          {po.terms && <p className="whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">{po.terms}</p>}
        </div>
      )}
    </div>
  );
}
