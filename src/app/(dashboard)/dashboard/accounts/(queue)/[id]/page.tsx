import Link from "next/link";
import { IntakeFormFor } from "../../../receiving/intake/[id]/intake-loader";

export const dynamic = "force-dynamic";

// One order in Accounts: the complete Receiving Intake Form, read-only, with Step 10 (Accounts) highlighted and payable.
export default async function AccountsOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <Link href="/dashboard/accounts" className="text-sm text-emerald-800 underline dark:text-emerald-300">‹ To Be Paid</Link>
      <div className="mt-3">
        <IntakeFormFor id={id} focus="accounts" />
      </div>
    </div>
  );
}
