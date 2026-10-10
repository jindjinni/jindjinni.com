import { paymentNoticeEmail } from "@/lib/receivable-rules";

/** The same words the server sends (pure, so the preview and the email can't drift apart). */
export function composeClientPreview(i: { invoiceNumber: string; buyer: string; contact: string | null; amount: number; paidOn: string; balanceAfter: number }, from: string, note: string) {
  return paymentNoticeEmail({ company: i.buyer, contact: i.contact, invoiceNumber: i.invoiceNumber, amount: i.amount, paidOn: i.paidOn, balance: i.balanceAfter, note: note || null, from });
}
