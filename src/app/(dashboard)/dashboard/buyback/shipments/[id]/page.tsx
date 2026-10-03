import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { getReceivingShipmentDetail, getProducts, getConditions } from "@/lib/queries";
import {
  removeReceivedItem,
  completeReceiving,
  markShipmentPaid,
  markCustomerNotified,
} from "@/app/actions/buyback";
import { ActionButton } from "@/components/action-button";
import { AddReceivedItemForm } from "./add-received-item-form";
import { PackagingForm } from "./packaging-form";

const receivingStyles: Record<string, string> = {
  IN_PROGRESS: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  COMPLETE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  COMPLETE_WITH_DISCREPANCY: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
};

const accountsDecisionLabels: Record<string, string> = {
  NEEDS_REVIEW: "Needs review",
  NEEDS_ADJUSTED_QUOTE: "Needs adjusted quote",
  NEEDS_RETURN: "Needs return",
  NEEDS_PAYMENT: "Needs payment",
  PAID: "Paid",
};

export default async function ReceivingShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireOrg();

  const [data, products, conditions] = await Promise.all([
    getReceivingShipmentDetail(org.organizationId, id),
    getProducts(org.organizationId),
    getConditions(org.organizationId),
  ]);
  if (!data) notFound();

  const { shipment, order, seller, quotedItems, items } = data;
  const isInProgress = shipment.receivingStatus === "IN_PROGRESS";
  const canMarkPaid = !isInProgress && shipment.accountsStatus === "IN_REVIEW";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {seller?.name ?? "Unknown seller"} -- receiving
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {order?.orderReference ? `Ref ${order.orderReference} · ` : ""}
            Quoted ${order?.quotedTotal.toFixed(2) ?? "0.00"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${receivingStyles[shipment.receivingStatus]}`}>
            {shipment.receivingStatus.replaceAll("_", " ")}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Accounts: {accountsDecisionLabels[shipment.accountsDecision]}
          </span>
        </div>
      </div>

      {quotedItems.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            What was quoted (for comparison)
          </h2>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qty quoted</th>
                  <th className="px-4 py-2 text-right font-medium">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {quotedItems.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{q.lineLabel}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {q.quotedQuantity}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      ${q.quotedUnitPrice.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">Packaging</h2>
        <PackagingForm shipmentId={shipment.id} shipment={shipment} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          What actually arrived
        </h2>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 text-right font-medium">Qty received</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                {isInProgress && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={isInProgress ? 6 : 5} className="px-4 py-8 text-center text-slate-400">
                    Nothing logged yet.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{item.productName}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.conditionName}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {item.itemSource === "EXTRA" ? "Extra / unquoted" : "Quoted"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {item.quantityReceived}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {item.discrepancyNotes ?? (item.returnRequired ? "Return requested" : "—")}
                  </td>
                  {isInProgress && (
                    <td className="px-4 py-3 text-right">
                      {!item.postedToInventory && (
                        <ActionButton
                          action={removeReceivedItem.bind(null, item.id)}
                          label="Remove"
                          pendingLabel="Removing..."
                          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isInProgress && (
          <AddReceivedItemForm shipmentId={shipment.id} products={products} conditions={conditions} quotedItems={quotedItems} />
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {isInProgress && (
          <ActionButton
            action={completeReceiving.bind(null, shipment.id)}
            label="Complete receiving & post to inventory"
            pendingLabel="Posting..."
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            confirm="This posts every logged item to inventory and locks receiving for this shipment. Continue?"
          />
        )}
        {canMarkPaid && (
          <ActionButton
            action={markShipmentPaid.bind(null, shipment.id)}
            label="Mark seller paid"
            pendingLabel="Saving..."
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          />
        )}
        {shipment.accountsStatus === "PAID" && !shipment.customerNotified && (
          <ActionButton
            action={markCustomerNotified.bind(null, shipment.id)}
            label="Mark customer notified"
            pendingLabel="Saving..."
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          />
        )}
        {shipment.customerNotified && (
          <span className="text-sm text-slate-500 dark:text-slate-400">Customer notified ✓</span>
        )}
      </div>
    </div>
  );
}
