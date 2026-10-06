import Link from "next/link";
import { IntakeFormFor } from "../../../receiving/intake/[id]/intake-loader";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

// One order in Accounts: the complete Receiving Intake Form, read-only, with Step 10 (Accounts) highlighted and payable.
export default async function AccountsOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const from = (await searchParams).from === "paid";
  return (
    <div>
      <Link href={from ? "/dashboard/accounts/paid" : "/dashboard/accounts"} className="text-sm text-emerald-800 underline dark:text-emerald-300">
        ‹ {from ? "Paid Orders" : "To Be Paid"}
      </Link>
      <div className="mt-3">
        <IntakeFormFor id={id} focus="accounts" />
      </div>
    </div>
  );
}
