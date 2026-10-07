import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { movementLayers, receivedLayers, recentMovements } from "@/lib/inventory-service";
import { HistoryList, type HistoryRow } from "./history-list";

export const dynamic = "force-dynamic";

// Stock History: every change to stock, newest first: units that arrived from Receiving, stock added by hand, units
// Sales took out, and corrections.
export default async function StockHistoryPage() {
  const org = await requireOrg();
  const [received, , moves] = await Promise.all([receivedLayers(org.organizationId), movementLayers(org.organizationId), recentMovements(org.organizationId, 500)]);
  const ids = [...new Set(moves.map((m) => m.createdByUserId).filter((x): x is string => !!x))];
  const people = ids.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
  const who = new Map(people.map((p) => [p.id, p.name || p.email]));

  const rows: HistoryRow[] = [
    ...received.map((r) => ({
      id: r.refId,
      day: r.day,
      kind: "RECEIVED" as const,
      productName: r.productName,
      brand: r.brand ?? "",
      condition: r.condition,
      expiry: r.expiry,
      lot: r.lot,
      quantity: r.quantity,
      detail: `Order ${r.orderNumber ?? ""}${r.customer ? ` · ${r.customer}` : ""}`.trim(),
      href: r.packageId ? `/dashboard/receiving/intake/${r.packageId}` : null,
      by: "",
    })),
    ...moves.map((m) => ({
      id: m.id,
      day: m.createdAt.slice(0, 10),
      kind: m.kind,
      productName: m.productName,
      brand: m.brand ?? "",
      condition: m.condition,
      expiry: m.expirationDate,
      lot: m.lotNumber,
      quantity: m.quantity,
      detail: m.note ?? "",
      href: null,
      by: (m.createdByUserId && who.get(m.createdByUserId)) || "",
    })),
  ]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, 500);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Stock History</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">Everything that changed the stock, newest first: packages received, stock added by hand, units sold and corrections. Showing the latest 500.</p>
      <HistoryList rows={rows} />
    </div>
  );
}
