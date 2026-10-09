import Link from "next/link";
import { redirect } from "next/navigation";
import { catalogItems, listSuppliers, newOrderDefaults } from "@/lib/purchase-order-service";
import { PoEditor, type EditorInitial } from "../po-editor";
import { requirePoPage } from "../gate";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  const { org, canWrite, today } = await requirePoPage();
  if (!canWrite) redirect("/dashboard/purchasing/purchase-orders");
  const [suppliers, catalog, defaults] = await Promise.all([listSuppliers(org.organizationId), catalogItems(org.organizationId), newOrderDefaults(org.organizationId)]);
  const wanted = (await searchParams).supplier;
  const pre = suppliers.find((s) => s.id === wanted);
  const initial: EditorInitial = {
    supplierId: pre?.id ?? "",
    supplierName: pre?.name ?? "",
    supplierAddress: pre?.address ?? "",
    supplierEmail: pre?.email ?? "",
    supplierLicense: pre?.licenseNumber ?? "",
    supplierLicenseExpires: pre?.licenseExpires ?? "",
    issueDate: today,
    shipToName: defaults.shipTo.name,
    shipToAddress: defaults.shipTo.address ?? "",
    billToName: defaults.billTo.name,
    billToAddress: defaults.billTo.address ?? "",
    reference: "",
    comments: "",
    terms: defaults.terms,
    shipping: "",
    lines: [],
  };
  return (
    <div className="max-w-5xl">
      <p className="text-sm"><Link href="/dashboard/purchasing/purchase-orders" className="text-emerald-800 underline dark:text-emerald-300">Purchase Orders</Link></p>
      <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">New purchase order</h1>
      <div className="mt-4">
        <PoEditor
          docId={null}
          number={null}
          initial={initial}
          today={today}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email ?? "", address: s.address ?? "", license: s.licenseNumber ?? "", licenseExpires: s.licenseExpires ?? "" }))}
          catalog={catalog}
        />
      </div>
    </div>
  );
}
