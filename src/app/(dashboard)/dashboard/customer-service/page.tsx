import { requireOrg } from "@/lib/tenant";
import { getToBeEmailed } from "@/lib/customer-service-queries";
import { CsList } from "./cs-list";

export const dynamic = "force-dynamic";

// To Be Emailed: every order Accounts has paid whose customer hasn't been told yet. Nothing is sent by itself.
export default async function ToBeEmailedPage() {
  const org = await requireOrg();
  const orders = await getToBeEmailed(org.organizationId);
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">To Be Emailed</h1>
      <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-400">
        Orders Accounts has paid. Open one to check the email and its payment receipt, then press Send. The customer is only ever told by email.
      </p>
      <CsList mode="waiting" orders={orders} />
    </div>
  );
}
