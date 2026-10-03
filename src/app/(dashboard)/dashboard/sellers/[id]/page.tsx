import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getSeller } from "@/lib/queries";
import { updateSeller } from "@/app/actions/buyback";
import { EditSellerForm } from "./edit-seller-form";

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireOrg();
  const seller = await getSeller(org.organizationId, id);
  if (!seller) notFound();

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/sellers" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Sellers
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{seller.name}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Keep this address current -- it's what gets used to buy a shipping label for this seller's
        quotes.
      </p>

      <EditSellerForm sellerId={seller.id} seller={seller} action={updateSeller} />
    </div>
  );
}
