import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getBuybackOrderWithItems, getProducts } from "@/lib/queries";
import { removeQuotedItem, createReceivingShipment } from "@/app/actions/buyback";
import { AddQuotedItemForm } from "./add-quoted-item-form";
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

  const [data, products] = await Promise.all([
    getBuybackOrderWithItems(org.organizationId, id),
    getProducts(org.organizationId),
  ]);
  if (!data) notFound();

  const { order, seller, items, shipments } = data;

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
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {order.orderReference ? `Ref ${order.orderReference} · ` : ""}
            {order.trackingNumber ? `Tracking ${order.trackingNumber} · ` : ""}
            {order.packageStatus}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-xs uppercase tracking-wide text-slate-400">Quoted total</span>
          <span className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            ${order.quotedTotal.toFixed(2)}
          </span>
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Code / variant</th>
              <th className="px-4 py-3 text-right font-medium">Qty quoted</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="px-4 py-3 text-right font-medium">Line total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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

      <AddQuotedItemForm orderId={order.id} products={products} />

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
