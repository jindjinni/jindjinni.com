import Link from "next/link";
import { listSuppliers } from "@/lib/purchase-order-service";
import { requirePoPage } from "../purchase-orders/gate";
import { SupplierManager, type SupplierRow } from "./supplier-manager";

export const dynamic = "force-dynamic";

// The wholesalers a distributor buys from, saved once so every purchase order can pick them.
export default async function SuppliersPage() {
  const { org, canWrite, today } = await requirePoPage();
  const rows: SupplierRow[] = (await listSuppliers(org.organizationId, { includeArchived: true })).map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    address: s.address ?? "",
    licenseNumber: s.licenseNumber ?? "",
    licenseExpires: s.licenseExpires ?? "",
    notes: s.notes ?? "",
    archived: !!s.archivedAt,
  }));
  return (
    <div className="max-w-4xl" data-testid="suppliers-page">
      <p className="text-sm"><Link href="/dashboard/purchasing/purchase-orders" className="text-emerald-800 underline dark:text-emerald-300">Purchase Orders</Link></p>
      <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">Suppliers</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">The wholesalers you buy from, with their license details. An order keeps its own copy of the supplier as it was when you made it.</p>
      <SupplierManager rows={rows} canWrite={canWrite} today={today} />
    </div>
  );
}
