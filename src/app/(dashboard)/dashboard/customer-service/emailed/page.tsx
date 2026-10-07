import { requireOrg } from "@/lib/tenant";
import { getEmailed } from "@/lib/customer-service-queries";
import { CsList } from "../cs-list";

export const dynamic = "force-dynamic";

// Emailed: every customer we have emailed about a payment, under the day it was sent. Open one to see exactly what went out.
export default async function EmailedPage() {
  const org = await requireOrg();
  const orders = await getEmailed(org.organizationId);
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Emailed</h1>
      <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-400">
        A customer asks &ldquo;did you email me?&rdquo; Find the order here and open it to see the exact email, what was attached, who sent it and when.
      </p>
      <CsList mode="emailed" orders={orders} />
    </div>
  );
}
