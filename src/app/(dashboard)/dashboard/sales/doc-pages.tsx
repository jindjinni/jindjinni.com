import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteSales } from "@/lib/permissions";
import { getDocument } from "@/lib/sales-service";
import { balanceOf, dueDateFor, lineAmount, shownStatus } from "@/lib/sales-rules";
import { StatusChip, card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { DocActions } from "./doc-actions";
import { DocEditor, type EditorInitial } from "./doc-editor";
import { loadEditorData } from "./editor-data";

const baseOf = (kind: "QUOTATION" | "INVOICE") => (kind === "INVOICE" ? "/dashboard/sales/invoices" : "/dashboard/sales/quotations");
const backOf = (kind: "QUOTATION" | "INVOICE") => (kind === "INVOICE" ? "/dashboard/sales/invoices" : "/dashboard/sales");

export async function DocNewPage({ kind, buyerId }: { kind: "QUOTATION" | "INVOICE"; buyerId?: string }) {
  const org = await requireOrg();
  if (!canWriteSales(org.role, org.access)) notFound();
  const data = await loadEditorData(org.organizationId, null);
  const isInvoice = kind === "INVOICE";
  const buyer = data.buyers.find((b) => b.id === buyerId);
  const terms = buyer?.terms || data.from.defaultTerms;
  const initial: EditorInitial = {
    buyerId: buyer?.id ?? "",
    company: buyer?.name ?? "",
    contact: buyer?.contact ?? "",
    email: buyer?.email ?? "",
    phone: buyer?.phone ?? "",
    billing: buyer?.billing ?? "",
    shipping: buyer?.shipping ?? "",
    docDate: data.today,
    dueDate: isInvoice ? dueDateFor(data.today, terms) : dueDateFor(data.today, "Net 7"),
    terms,
    reference: "",
    discount: "",
    shipping_: "",
    tax: "",
    other: "",
    notes: buyer?.notes || data.from.defaultNotes || "",
    internalNotes: "",
    lines: [],
  };
  return (
    <div className="max-w-5xl">
      <Link href={backOf(kind)} className="text-sm text-slate-600 underline dark:text-slate-400">← {isInvoice ? "All invoices" : "All quotations"}</Link>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50">New {isInvoice ? "invoice" : "quotation"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Pick the buyer, then add items. Beside each item you&apos;ll see how many you have in stock and how many are still available to sell.
      </p>
      <div className="mt-4">
        <DocEditor kind={kind} docId={null} number={null} base={baseOf(kind)} initial={initial} buyers={data.buyers} products={data.products} conditions={data.conditions} stock={data.stock} reserved={data.reserved} buyerPrices={data.buyerPrices} />
      </div>
    </div>
  );
}

export async function DocDetailPage({ kind, id }: { kind: "QUOTATION" | "INVOICE"; id: string }) {
  const org = await requireOrg();
  const found = await getDocument(org.organizationId, id);
  if (!found || found.doc.kind !== kind) notFound();
  const { doc, lines, payments } = found;
  const canWrite = canWriteSales(org.role, org.access);
  const isInvoice = kind === "INVOICE";
  const data = await loadEditorData(org.organizationId, doc.status === "DRAFT" ? doc.id : null);
  const status = shownStatus(doc, data.today);
  const actions = (
    <DocActions
      doc={{ id: doc.id, kind, status: doc.status, number: doc.number, buyerEmail: doc.buyerEmail ?? "", total: doc.total, amountPaid: doc.amountPaid, convertedToId: doc.convertedToId, inventoryPosted: doc.inventoryPosted, emailedTo: doc.emailedTo, sentAt: doc.sentAt }}
      payments={payments.map((p) => ({ id: p.id, amount: p.amount, paidOn: p.paidOn, method: p.method ?? "", note: p.note ?? "" }))}
      today={data.today}
      canWrite={canWrite}
      base={baseOf(kind)}
    />
  );
  const head = (
    <div>
      <Link href={backOf(kind)} className="text-sm text-slate-600 underline dark:text-slate-400">← {isInvoice ? "All invoices" : "All quotations"}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="doc-title">{isInvoice ? `Invoice #${doc.number}` : `Quotation ${doc.number}`}</h1>
        <StatusChip status={status} />
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400" data-testid="doc-sub">
        {doc.buyerCompany} · {fmtDay(doc.docDate)}
        {doc.sentAt ? ` · sent ${fmtDay(doc.sentAt)}${doc.emailedTo ? ` to ${doc.emailedTo}` : ""}` : ""}
      </p>
    </div>
  );

  if (doc.status === "DRAFT" && canWrite) {
    const initial: EditorInitial = {
      buyerId: doc.buyerId ?? "",
      company: doc.buyerCompany ?? "",
      contact: doc.buyerContact ?? "",
      email: doc.buyerEmail ?? "",
      phone: doc.buyerPhone ?? "",
      billing: doc.buyerBillingAddress ?? "",
      shipping: doc.buyerShippingAddress ?? "",
      docDate: doc.docDate,
      dueDate: doc.dueDate ?? "",
      terms: doc.terms ?? data.from.defaultTerms,
      reference: doc.reference ?? "",
      discount: doc.discount ? String(doc.discount) : "",
      shipping_: doc.shipping ? String(doc.shipping) : "",
      tax: doc.tax ? String(doc.tax) : "",
      other: doc.otherCharges ? String(doc.otherCharges) : "",
      notes: doc.customerNotes ?? "",
      internalNotes: doc.internalNotes ?? "",
      lines: lines.map((l) => ({ productKey: l.productKey, productId: l.productId, productName: l.productName, condition: l.condition, groupKey: l.groupKey, groupLabel: l.groupLabel, quantity: String(l.quantity), unitPrice: String(l.unitPrice), note: l.note ?? "" })),
    };
    return (
      <div className="max-w-5xl space-y-5">
        {head}
        {actions}
        <DocEditor kind={kind} docId={doc.id} number={doc.number} base={baseOf(kind)} initial={initial} buyers={data.buyers} products={data.products} conditions={data.conditions} stock={data.stock} reserved={data.reserved} buyerPrices={data.buyerPrices} />
      </div>
    );
  }

  // Sent, paid or void (or a role that can only look): the document as it was made.
  return (
    <div className="max-w-4xl space-y-5">
      {head}
      {actions}
      <div className={`${card} grid gap-4 sm:grid-cols-3`} data-testid="doc-summary">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{doc.buyerCompany}</p>
          {doc.buyerContact && <p className="text-sm">{doc.buyerContact}</p>}
          <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{doc.buyerBillingAddress}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{[doc.buyerEmail, doc.buyerPhone].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ship to</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{doc.buyerShippingAddress || doc.buyerBillingAddress}</p>
        </div>
        <div className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
          <p className="mt-1">Date: {fmtDay(doc.docDate)}</p>
          {doc.dueDate && <p>{isInvoice ? "Due" : "Valid until"}: {fmtDay(doc.dueDate)}</p>}
          {isInvoice && doc.terms && <p>Terms: {doc.terms}</p>}
          {doc.reference && <p>Reference: {doc.reference}</p>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm" data-testid="doc-lines">
          <thead className="bg-sky-700 text-left text-xs uppercase tracking-wide text-white">
            <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Expires</th><th className="px-3 py-2">Cond.</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800" data-testid="doc-line">
                <td className="px-3 py-2">{l.productName}</td>
                <td className="px-3 py-2 text-slate-500">{l.expiryText ?? l.groupLabel ?? ""}</td>
                <td className="px-3 py-2 text-slate-500">{l.condition}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.unitPrice)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(lineAmount(l.quantity, l.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto w-full max-w-xs space-y-1 text-sm" data-testid="doc-totals">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{fmtMoney(doc.subtotal)}</span></div>
        {doc.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="tabular-nums">-{fmtMoney(doc.discount)}</span></div>}
        {doc.shipping > 0 && <div className="flex justify-between"><span className="text-slate-500">Shipping</span><span className="tabular-nums">{fmtMoney(doc.shipping)}</span></div>}
        {doc.tax > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="tabular-nums">{fmtMoney(doc.tax)}</span></div>}
        {doc.otherCharges > 0 && <div className="flex justify-between"><span className="text-slate-500">Other</span><span className="tabular-nums">{fmtMoney(doc.otherCharges)}</span></div>}
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold dark:border-slate-700"><span>{isInvoice ? "Total due" : "Total"}</span><span className="tabular-nums" data-testid="doc-total">{fmtMoney(doc.total)}</span></div>
        {isInvoice && doc.amountPaid > 0 && <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className="tabular-nums" data-testid="doc-balance">{fmtMoney(balanceOf(doc))}</span></div>}
      </div>
      {doc.customerNotes && <p className="whitespace-pre-line rounded-lg bg-white p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">{doc.customerNotes}</p>}
      {doc.internalNotes && canWrite && <p className="whitespace-pre-line rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"><strong>Private notes:</strong> {doc.internalNotes}</p>}
    </div>
  );
}
