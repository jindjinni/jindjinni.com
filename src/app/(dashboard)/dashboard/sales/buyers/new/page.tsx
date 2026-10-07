import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { canWriteSales } from "@/lib/permissions";
import { BuyerForm, EMPTY_BUYER } from "../buyer-form";

export default async function NewBuyerPage() {
  const org = await requireOrg();
  if (!canWriteSales(org.role, org.access)) notFound();
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/sales/buyers" className="text-sm text-slate-600 underline dark:text-slate-400">← All buyers</Link>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50">Add a buyer</h1>
      <div className="mt-4"><BuyerForm id={null} initial={EMPTY_BUYER} /></div>
    </div>
  );
}
