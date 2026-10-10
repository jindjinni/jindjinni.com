import Link from "next/link";
import { notFound } from "next/navigation";
import { getNoticeDetail } from "@/lib/receivable-service";
import { canSendCustomerEmails } from "@/lib/permissions";
import { noticeReadiness } from "@/lib/receivable-rules";
import { card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { requirePayments } from "../gate";
import { NoticeForm } from "../notice-form";

export const dynamic = "force-dynamic";

export default async function PaymentNoticePage({ params }: { params: Promise<{ paymentId: string }> }) {
  const org = await requirePayments();
  const { paymentId } = await params;
  const d = await getNoticeDetail(org.organizationId, paymentId);
  if (!d) notFound();
  const { item, handled } = d;
  const canSend = canSendCustomerEmails(org.role, org.access) && !org.viewAs && !handled && !item.invoiceVoid;
  const ready = noticeReadiness({ to: item.email, handled: !!handled, invoiceVoid: item.invoiceVoid });
  return (
    <div className="max-w-3xl space-y-5" data-testid="notice-page">
      <Link href="/dashboard/customer-service/payments" className="text-sm text-slate-600 underline dark:text-slate-400">← Payments Received</Link>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Payment on invoice #{item.invoiceNumber}</h1>
      <div className={`${card} grid gap-4 sm:grid-cols-4`} data-testid="notice-facts">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p><p className="mt-1 text-sm font-medium">{item.buyer}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</p><p className="mt-1 text-sm font-medium">{fmtDay(item.paidOn)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</p><p className="mt-1 text-sm font-bold tabular-nums">{fmtMoney(item.amount)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Still owed</p><p className="mt-1 text-sm font-medium tabular-nums">{item.balanceAfter > 0 ? fmtMoney(item.balanceAfter) : "Nothing. Paid in full"}</p></div>
      </div>

      {handled ? (
        <div className={`${card} space-y-2`} data-testid="notice-handled">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{handled.status === "SENT" ? `Emailed to ${handled.toEmail}` : "Set aside, no email sent"}</p>
          <p className="text-xs text-slate-500">{handled.handledByName ?? "Someone"} · {handled.handledAt.slice(0, 16).replace("T", " ")} UTC{handled.note ? ` · ${handled.note}` : ""}</p>
          {handled.status === "SENT" && (
            <>
              <p className="text-sm"><span className="text-slate-500">Subject: </span>{handled.subject}</p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200" data-testid="notice-sent-body">{handled.body}</pre>
            </>
          )}
        </div>
      ) : (
        <>
          {item.invoiceVoid && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">This invoice was voided, so no email can be sent.</p>}
          {!ready.ready && !item.invoiceVoid && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="notice-blockers">{ready.blockers.join(" ")}</p>}
          <NoticeForm paymentId={paymentId} item={{ invoiceNumber: item.invoiceNumber, buyer: item.buyer, contact: item.contact, amount: item.amount, paidOn: item.paidOn, balanceAfter: item.balanceAfter }} from={d.from} email={item.email} canSend={canSend} />
          {!canSend && !item.invoiceVoid && <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="notice-readonly">You can look at this payment. Only Customer Service, an Admin or the Owner sends the email.</p>}
        </>
      )}
    </div>
  );
}
