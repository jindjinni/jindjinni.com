import { isPurchasingManager, canWritePurchasing } from "@/lib/permissions";
import { getReceiptState } from "@/lib/purchasing-receipt-docs";
import { ReceiptCell } from "../receipt-cell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingQuotationWithItems,
  getPurchasingProducts,
  getPurchasingConditions,
  getProductConditionsMap,
  getPurchasingExpirationRanges,
  getAllProductMultipliersForOrg,
  purchasingCustomerName,
  getOrganization,
  hasShipFromAddress,
  hasCustomerAddress,
} from "@/lib/queries";
import { archivePurchasingQuotation, restorePurchasingQuotation } from "@/app/actions/purchasing";
import { AddQuotedItemForm } from "./add-quoted-item-form";
import { QuotationHeaderForm } from "./quotation-header-form";
import { DeductionForm } from "./deduction-form";
import { QuotedItemRow } from "./quoted-item-row";
import { ShippingLabelSection } from "./shipping-label-section";
import { ActionButton } from "@/components/action-button";
import type { PriceTables } from "@/lib/purchasing-price";
import { listRecalls } from "@/lib/receiving-recall-service";

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();
  const canEdit = isPurchasingManager(org.role);

  const data = await getPurchasingQuotationWithItems(org.organizationId, id);
  if (!data) notFound();
  const { quotation, items, customer } = data;
  const receiptState = await getReceiptState(org.organizationId, quotation.id, items.length);

  const [products, conditions, ranges, productConditionsMap, orgRow, multiplierRows, recalls] = await Promise.all([
    getPurchasingProducts(org.organizationId),
    getPurchasingConditions(org.organizationId),
    getPurchasingExpirationRanges(org.organizationId),
    getProductConditionsMap(org.organizationId),
    getOrganization(org.organizationId),
    getAllProductMultipliersForOrg(org.organizationId),
    listRecalls(org.organizationId),
  ]);

  // Which month ranges each product is quoted at, and which products never
  // expire -- the Expiry dropdown shows only these (falls back to every range
  // for a product with no options set up yet).
  const productExpiryOptions: Record<string, string[]> = {};
  for (const m of multiplierRows) (productExpiryOptions[m.productId] ??= []).push(m.expirationRangeId);
  const noExpirationProductIds = products.filter((p) => p.noExpiration).map((p) => p.id);
  // The percentages behind the live price shown on the Add line / Edit forms (same numbers the server uses to price a line).
  const priceTables: PriceTables = {
    rangeDefaults: Object.fromEntries(ranges.map((r) => [r.id, r.defaultMultiplier ?? 1])),
    productMultipliers: {},
    conditionMultipliers: Object.fromEntries(conditions.map((c) => [c.id, c.multiplier])),
  };
  for (const m of multiplierRows) (priceTables.productMultipliers[m.productId] ??= {})[m.expirationRangeId] = m.multiplier;

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/purchasing/quotations" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Quotations
        </Link>
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {quotation.quotationNumber}
            {quotation.archivedAt && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">
                Archived
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {customer ? (
              <Link href={`/dashboard/purchasing/customers/${customer.id}`} className="hover:underline">
                {purchasingCustomerName(customer)}
              </Link>
            ) : (
              quotation.customerNameSnapshot
            )}
          </p>
          <QuotationHeaderForm
            quotationId={quotation.id}
            quotationDate={quotation.quotationDate}
            trackingNumber={quotation.trackingNumber}
            carrier={quotation.carrier}
            packageStatus={quotation.packageStatus}
            notes={quotation.notes}
          />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Receipt</span>
            <ReceiptCell
              quotationId={quotation.id}
              label={quotation.quotationNumber}
              receipt={receiptState.receipt}
              stamp={receiptState.stamp}
              isImage={receiptState.isImage}
              canWrite={canWritePurchasing(org.role)}
            />
          </div>
          <Link
            href={`/dashboard/purchasing/quotations/${quotation.id}/receipt`}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            View receipt
          </Link>
          {canEdit &&
            (!quotation.archivedAt ? (
              <ActionButton
                action={archivePurchasingQuotation.bind(null, quotation.id)}
                label="Archive"
                pendingLabel="Archiving..."
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300"
              />
            ) : (
              <ActionButton
                action={restorePurchasingQuotation.bind(null, quotation.id)}
                label="Restore"
                pendingLabel="Restoring..."
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
              />
            ))}
        </div>
      </div>

      {quotation.source === "IMPORTED" && (
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-slate-200">
          <p className="font-medium text-blue-900 dark:text-blue-200">
            Imported order
            {quotation.importedAt ? <span className="ml-2 text-xs font-normal text-blue-800/70 dark:text-blue-300/70">added {quotation.importedAt.slice(0, 10)}</span> : null}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            This order came in through a spreadsheet import, so its total and items below are kept as they were in the file.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Items quoted for</dt>
              <dd className="mt-0.5 whitespace-pre-line">{quotation.importedItemsText || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Shipping info</dt>
              <dd className="mt-0.5">{quotation.importedShippingAddress || "—"}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Condition</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="px-4 py-3 text-right font-medium">Line total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Nothing quoted yet. Add a line below.
                </td>
              </tr>
            )}
            {items.map((item, i) => (
              <QuotedItemRow
                key={item.id}
                item={item}
                index={i}
                conditions={conditions}
                productConditions={Object.fromEntries(productConditionsMap)}
                ranges={ranges}
                productExpiryOptions={productExpiryOptions}
                noExpirationProductIds={noExpirationProductIds}
                canOverridePrice={canEdit}
                priceTables={priceTables}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AddQuotedItemForm
        quotationId={quotation.id}
        products={products}
        conditions={conditions}
        productConditions={Object.fromEntries(productConditionsMap)}
        ranges={ranges}
        productExpiryOptions={productExpiryOptions}
        noExpirationProductIds={noExpirationProductIds}
        canOverridePrice={canEdit}
        recalls={recalls}
        priceTables={priceTables}
      />

      <DeductionForm
        quotationId={quotation.id}
        deductionEnabled={quotation.deductionEnabled}
        deductionAmount={quotation.deductionAmount}
        deductionReason={quotation.deductionReason}
      />

      <div className="mt-4 flex flex-col items-end gap-1 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          Items total: <span className="tabular-nums text-slate-900 dark:text-slate-50">${quotation.itemsTotal.toFixed(2)}</span>
        </span>
        {quotation.bonusAmount > 0 && (
          <span className="text-emerald-700 dark:text-emerald-400">
            Automatic bonus ({quotation.bonusTierLabelSnapshot}):{" "}
            <span className="tabular-nums">+${quotation.bonusAmount.toFixed(2)}</span>
          </span>
        )}
        {quotation.deductionEnabled && quotation.deductionAmount > 0 && (
          <span className="text-red-600 dark:text-red-400">
            Deduction: <span className="tabular-nums">−${quotation.deductionAmount.toFixed(2)}</span>
          </span>
        )}
        <span className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Grand total: <span className="tabular-nums">${quotation.grandTotal.toFixed(2)}</span>
        </span>
      </div>

      {customer && (
        <ShippingLabelSection
          quotationId={quotation.id}
          customerId={customer.id}
          parcelLengthIn={quotation.parcelLengthIn}
          parcelWidthIn={quotation.parcelWidthIn}
          parcelHeightIn={quotation.parcelHeightIn}
          parcelWeightLb={quotation.parcelWeightLb}
          labelStatus={quotation.labelStatus}
          labelUrl={quotation.labelUrl}
          labelTrackingNumber={quotation.labelTrackingNumber}
          labelTrackingUrl={quotation.labelTrackingUrl}
          labelError={quotation.labelError}
          hasOrgAddress={hasShipFromAddress(orgRow)}
          hasCustomerAddr={hasCustomerAddress(customer)}
        />
      )}
    </div>
  );
}
