import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteInventory } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { importProducts, listStockImports } from "@/lib/inventory-import-service";
import { templateCsv } from "@/lib/inventory-import-rules";
import { ImportForm } from "./import-form";
import { RecentImports } from "./recent-imports";

export const dynamic = "force-dynamic";

// Import Stock: a company that is moving over loads what it holds today from an Excel or CSV file. The file is read and shown first;
// nothing is saved until the person presses Add. After that, stock arrives by itself from Receiving and leaves through Sales.
export default async function ImportStockPage() {
  const org = await requireOrg();
  if (!canWriteInventory(org.role, org.access) || !(await featureOn("inventory-import", org.organizationId))) notFound();
  const [products, imports] = await Promise.all([importProducts(org.organizationId), listStockImports(org.organizationId)]);
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(products.map((p) => p.name)))}`;
  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Import Stock</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Load what you hold today from an Excel or CSV file. You see exactly what will be added before anything is saved, and the same file can&apos;t be added twice. After this, new stock arrives by itself from Receiving and leaves when Sales sends an invoice. To add a few lines by hand, use Manual Add.
      </p>
      <ImportForm products={products} conditions={[...MANUAL_CONDITIONS]} template={template} />
      <RecentImports imports={imports} />
    </div>
  );
}
