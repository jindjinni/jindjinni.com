import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingQuotationWithItems,
  getReceiptVersions,
  getBusinessProfile,
  resolveBusinessDocumentIdentity,
} from "@/lib/queries";
import { saveReceiptVersion } from "@/app/actions/purchasing";
import { ActionButton } from "@/components/action-button";
import { PrintButton } from "./print-button";

export default async function QuotationReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();

  const data = await getPurchasingQuotationWithItems(org.organizationId, id);
  if (!data) notFound();
  const { quotation, items } = data;
  const versions = await getReceiptVersions(id);
  const profile = await getBusinessProfile(org.organizationId);
  const business = resolveBusinessDocumentIdentity(org.organizationName, profile);

  const validUntil = new Date(quotation.quotationDate);
  validUntil.setHours(validUntil.getHours() + 72);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/dashboard/purchasing/quotations/${id}`}
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Back to quotation
        </Link>
        <div className="flex items-center gap-3">
          <ActionButton
            action={saveReceiptVersion.bind(null, id)}
            label="Save version to history"
            pendingLabel="Saving..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
          />
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-slate-900 shadow-sm print:border-none print:p-0 print:shadow-none dark:border-slate-800 dark:bg-white">
        <div className="rounded-md bg-amber-400 px-4 py-2 text-center text-sm font-bold uppercase tracking-wide text-slate-900">
          Limited Time Offer!
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {business.showLogo && business.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logoDataUrl} alt={business.displayName} className="h-12 w-12 object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight">{business.displayName}</h1>
              {business.address && (
                <p className="text-xs text-slate-500">
                  {[business.address.street1, business.address.street2].filter(Boolean).join(" ")}
                  {business.address.city ? `, ${[business.address.city, business.address.state, business.address.zip].filter(Boolean).join(" ")}` : ""}
                </p>
              )}
              {(business.phone || business.email || business.website) && (
                <p className="text-xs text-slate-500">
                  {[business.phone, business.email, business.website].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <span className="shrink-0 text-sm text-slate-500">{new Date(quotation.quotationDate).toLocaleDateString()}</span>
        </div>

        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Quotation for:</p>
        <p className="text-lg font-semibold">{quotation.customerNameSnapshot}</p>
        <p className="text-sm text-slate-500">Reference: {quotation.quotationNumber}</p>

        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Product</th>
              <th className="py-2 pr-2 font-semibold">Note</th>
              <th className="py-2 pr-2 font-semibold">Expiry</th>
              <th className="py-2 pr-2 text-right font-semibold">Qty</th>
              <th className="py-2 pr-2 text-right font-semibold">Unit Price</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="py-2 pr-2 text-slate-500">{i + 1}</td>
                <td className="py-2 pr-2">{item.productNameSnapshot}</td>
                <td className="py-2 pr-2 text-slate-500">{item.conditionNameSnapshot ?? ""}</td>
                <td className="py-2 pr-2 text-slate-500">{item.expirationRangeLabelSnapshot ?? ""}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 pr-2 text-right tabular-nums">${item.finalUnitPrice.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <span>
            Items Total: <span className="tabular-nums font-medium">${quotation.itemsTotal.toFixed(2)}</span>
          </span>
          {quotation.bonusAmount > 0 && (
            <span>
              Bonus: <span className="tabular-nums font-medium">+${quotation.bonusAmount.toFixed(2)}</span>
            </span>
          )}
          {quotation.deductionEnabled && quotation.deductionAmount > 0 && (
            <span>
              Deduction: <span className="tabular-nums font-medium">−${quotation.deductionAmount.toFixed(2)}</span>
            </span>
          )}
          <span className="text-base font-bold">
            Grand Total: <span className="tabular-nums">${quotation.grandTotal.toFixed(2)}</span>
          </span>
        </div>

        <div className="mt-4 rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">
          Total will be ${quotation.grandTotal.toFixed(2)} plus free shipping!
        </div>

        <div className="mt-6 space-y-2 text-xs leading-relaxed text-slate-500">
          <p>
            <strong>Hidden Damage:</strong> [Exact policy wording to confirm against your reference receipt.]
          </p>
          <p>
            <strong>Packaging Damage:</strong> [Exact policy wording to confirm against your reference receipt.]
          </p>
          <p>
            <strong>Lost Packages:</strong> [Exact policy wording to confirm against your reference receipt.]
          </p>
        </div>

        <p className="mt-3 text-center text-xs font-semibold text-red-600">
          Payment is issued only after items are received and verified.
        </p>
        <p className="mt-1 text-center text-xs text-slate-400">
          This quotation is valid for 72 hours, until {validUntil.toLocaleString()}.
        </p>
      </div>

      {versions.length > 0 && (
        <div className="mx-auto mt-6 max-w-2xl print:hidden">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Saved receipt history</h2>
          <ul className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {versions.map((v) => (
              <li key={v.id}>
                Version {v.version} — saved {new Date(v.generatedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
