import { requireOrg } from "@/lib/tenant";
import { getPaidOrders } from "@/lib/accounts-queries";
import { AccountsShell } from "../accounts-shell";

export const dynamic = "force-dynamic";

// Paid Orders: the paid orders as small cards on the left (like To Be Paid), under the day each was paid. Opening one
// shows the same complete receiving form with its Paid stamp, the date and time, and the receipt.
export default async function PaidLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const orders = await getPaidOrders(org.organizationId);
  return <AccountsShell mode="paid" orders={orders}>{children}</AccountsShell>;
}
