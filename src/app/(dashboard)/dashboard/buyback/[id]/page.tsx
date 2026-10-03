import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getBuybackOrderWithItems,
  getProducts,
  getConditions,
  getOrganization,
  hasShipFromAddress,
  hasSellerAddress,
} from "@/lib/queries";
import { removeQuotedItem, createReceivingShipment } from "@/app/actions/buyback";
import { AddQuotedItemForm } from "./add-quoted-item-form";
import { OrderHeaderForm } from "./order-header-form";
import { OrderAdjustmentForm } from "./order-adjustment-form";
import { ShippingLabelSection } from "./shipping-label-section";
import { ActionButton } from "@/components/action-button";

const shipmentStatusStyles: Record<string, string> = {
  IN_PROGRESS: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  COMPLETE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  COMPLETE_WITH_DISCREPANCY: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
};

export default async function BuybackOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireOrg();

  const [data, products, conditions, orgRow] = await Promise.all([
    getBuybackOrderWithItems(org.organizationId, id),
    getProducts(org.organizationId),
    getConditions(org.organizationId),
    getOrganization(org.organizationId),
  ]);
  if (!data) notFound();

  const { order, seller, items, shipments } = data;
  const itemsTotal = order.quotedTotal;
  const grandTotal = order.adjustmentEnabled ? itemsTotal - order.deductionAmount : itemsTotal;

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/buyback/orders" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Quotes
        </Link>
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {seller?.name ?? "Unknown seller"}
            {seller && !hasSellerAddress(seller) && (
              <Link
                href={`/dashboard/sellers/${seller.id}`}
                className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:underline dark:bg-amber-950 dark:text-amber-400"
              >
                Add shipping address
              </Link>
            )}
          </h1>
          <OrderHeaderForm
            orderId={order.id}
            orderReference={order.orderReference}
            orderDate={order.orderDate}
            trackingNumber={order.trackingNumber}
          />
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{order.packageStatus}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-xs uppercase tracking-wide text-slate-400">Items total</span>
          <span className="text-lg font-medium tabular-nums text-slate-700 dark:text-slate-300">
            ${itemsTotal.toFixed(2)}
          </span>
          {order.adjustmentEnabled && (
            <>
              <span className="mt-1 block text-xs uppercase tracking-wide text-slate-400">
                Deduction
              </span>
              <span className="text-sm tabular-nums text-red-600 dark:text-red-400">
                −${order.deductionAmount.toFixed(2)}
              </span>
            </>
          )}
          <span className="mt-1 block text-xs uppercase tracking-wide text-slate-400">Grand total</span>
          <span className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            ${grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Code / variant</th>
              <th className="px-4 py-3 font-medium">Condition</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 text-right font-medium">Qty quoted</th>
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
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{item.lineLabel}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {item.productCodeVariant ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {item.conditionName ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {item.expirationDate ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {item.quotedQuantity}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  ${item.quotedUnitPrice.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
                  ${(item.quotedQuantity * item.quotedUnitPrice).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={removeQuotedItem.bind(null, item.id)}
                    label="Remove"
                    pendingLabel="Removing..."
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddQuotedItemForm orderId={order.id} products={products} conditions={conditions} />

      <OrderAdjustmentForm
        orderId={order.id}
        adjustmentEnabled={order.adjustmentEnabled}
        deductionAmount={order.deductionAmount}
      />

      <ShippingLabelSection
        orderId={order.id}
        sellerId={order.sellerId}
        labelCarrier={order.labelCarrier}
        parcelLengthIn={order.parcelLengthIn}
        parcelWidthIn={order.parcelWidthIn}
        parcelHeightIn={order.parcelHeightIn}
        parcelWeightLb={order.parcelWeightLb}
        labelStatus={order.labelStatus}
        labelUrl={order.labelUrl}
        labelTrackingNumber={order.labelTrackingNumber}
        labelTrackingUrl={order.labelTrackingUrl}
        labelError={order.labelError}
        hasOrgAddress={hasShipFromAddress(orgRow)}
        hasSellerAddr={hasSellerAddress(seller)}
      />

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Receiving shipments
        </h2>
        <ActionButton
          action={createReceivingShipment.bind(null, order.id)}
          label="Package arrived -- start receiving"
          pendingLabel="Starting..."
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {shipments.length === 0 && (
          <p className="text-sm text-slate-400">
            No package logged as received yet.
          </p>
        )}
        {shipments.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/buyback/shipments/${s.id}`}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="text-slate-700 dark:text-slate-300">
              Logged {new Date(s.createdAt).toLocaleString()}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${shipmentStatusStyles[s.receivingStatus]}`}>
              {s.receivingStatus.replaceAll("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
