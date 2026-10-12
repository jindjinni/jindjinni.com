import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPaymentTerms, getToBePaid } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { dueWording, startSentence } from "@/lib/accounts-rules";
import { IntakeFormFor } from "../../../receiving/intake/[id]/intake-loader";
import { payoutForShipment } from "@/lib/storefront-payouts";
import { maskedLine } from "@/lib/bank-rules";
import { canRevealBankDetails } from "@/lib/permissions";
import { BankBox } from "../../../purchasing/website-requests/bank-box";

export const dynamic = "force-dynamic";

const BANNER = {
  OVERDUE: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
  TODAY: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  TOMORROW: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
  LATER: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
} as const;

// One order in Accounts: when it must be paid (or how overdue it is), then the complete Receiving Intake Form,
// read-only, with Step 10 (Accounts) highlighted and payable.
export default async function AccountsOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();
  const terms = await getPaymentTerms(org.organizationId);
  const order = (await getToBePaid(org.organizationId, terms)).find((o) => o.id === id);
  const today = todayIn(terms.timeZone);
  const payout = await payoutForShipment(org.organizationId, id);
  const canReveal = !org.viewAs && canRevealBankDetails(org.role, org.access);
  const due = order?.dueDay ? dueWording(order.dueDay, today) : null;
  return (
    <div>
      <Link href="/dashboard/accounts" className="text-sm text-emerald-800 underline dark:text-emerald-300">‹ To Be Paid</Link>
      {due && order && (
        <div data-testid="due-banner" data-state={due.state} className={`mt-3 space-y-1 rounded-lg border px-4 py-3 text-sm ${BANNER[due.state]}`}>
          {order.dueStartDay && <p data-testid="due-delivered" className="font-semibold">{startSentence(order.dueStartDay, order.dueBasis)}.</p>}
          <p data-testid="due-sentence" className="font-semibold">{due.sentence}</p>
        </div>
      )}
      {payout && (
        <section className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Where to pay this seller" data-testid="pay-bank-section">
          <h2 className="font-semibold text-slate-900 dark:text-slate-50">Where to pay this seller</h2>
          <p className="mt-0.5 text-slate-500">Website order {payout.reference}. The seller asked to be paid by direct deposit. After you have paid and attached the receipt, erase the stored details.</p>
          <BankBox requestId={payout.requestId} line={maskedLine(payout.summary.accountType, payout.summary.accountLast4)} canReveal={canReveal} erased={!!payout.summary.erasedAt} />
        </section>
      )}
      <div className="mt-3">
        <IntakeFormFor id={id} focus="accounts" />
      </div>
    </div>
  );
}
