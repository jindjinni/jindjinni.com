import { requireOrg } from "@/lib/tenant";
import { getPaymentTerms, getToBePaid } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { AccountsShell } from "../accounts-shell";

export const dynamic = "force-dynamic";

// To Be Paid: the waiting orders as small cards on the left (like the Receiving intake list). Opening one gives the
// complete receiving form the full width, with the list one tap away (see AccountsShell).
export default async function QueueLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const terms = await getPaymentTerms(org.organizationId);
  const orders = await getToBePaid(org.organizationId, terms);
  return <AccountsShell orders={orders} today={todayIn(terms.timeZone)}>{children}</AccountsShell>;
}
