import Link from "next/link";
import { IntakeFormFor } from "../../../receiving/intake/[id]/intake-loader";

export const dynamic = "force-dynamic";

// One paid order: the complete receiving form with its Paid stamp, the date and time, and the receipt.
export default async function PaidOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <Link href="/dashboard/accounts/paid" className="text-sm text-emerald-800 underline dark:text-emerald-300">‹ Paid Orders</Link>
      <div className="mt-3">
        <IntakeFormFor id={id} focus="accounts" />
      </div>
    </div>
  );
}
