import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewShipping, canWriteSales } from "@/lib/permissions";
import { shipmentsForDocument, shippingOn } from "@/lib/shipping-service";
import { canShipFrom, statusLabel } from "@/lib/shipping-rules";
import { getDocument, salesOrdersOn } from "@/lib/sales-service";
import { DOC_BACK, DOC_BASE, docWord, dueLabel, refShort, type DocKind } from "@/lib/sales-doc-ui";
import { listRevisions } from "@/lib/document-revision-service";
import { getTemplate } from "@/lib/document-template-service";
import { purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { balanceOf, dueDateFor, hasNdcColumn, lineAmount, shownStatus } from "@/lib/sales-rules";
import { StatusChip, card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { DocActions } from "./doc-actions";
import { DocEditor, type EditorInitial } from "./doc-editor";
import { loadEditorData } from "./editor-data";

type Kind = DocKind;
const baseOf = (kind: Kind) => DOC_BASE[kind];
const backOf = (kind: Kind) => DOC_BACK[kind];
const wordOf = (kind: Kind) => docWord(kind);

export async function DocNewPage({ kind, buyerId }: { kind: Kind; buyerId?: string }) {
  const org = await requireOrg();
  if (!canWriteSales(org.role, org.access)) notFound();
  const data = await loadEditorData(org.organizationId, null);
  if (kind === "SALES_ORDER" && !(await salesOrdersOn(org.organizationId))) notFound();
  const isInvoice = kind === "INVOICE";
  const isPo = kind === "PURCHASE_ORDER";
  const buyer = data.buyers.find((b) => b.id === buyerId);
  const terms = buyer?.terms || data.from.defaultTerms;
  // The company's Sales template (Settings -> Document Templates) can supply the standard notes for a new quotation or purchase order.
  const tplNotes = isInvoice || kind === "SALES_ORDER" ? null : (await getTemplate(org.organizationId, "sales", kind as "QUOTATION" | "PURCHASE_ORDER")).termsText;
  const initial: EditorInitial = {
    buyerId: buyer?.id ?? "",
    company: buyer?.name ?? "",
    contact: buyer?.contact ?? "",
    email: buyer?.email ?? "",
    phone: buyer?.phone ?? "",
    billing: buyer?.billing ?? "",
    shipping: buyer?.shipping ?? "",
    docDate: data.today,
    dueDate: isInvoice ? dueDateFor(data.today, terms) : dueDateFor(data.today, "Net 7"), // an order's "needed by" / "ship by" / "valid until" is a week out
    terms,
    reference: "",
    discount: "",
    shipping_: "",
    tax: "",
    other: "",
    notes: buyer?.notes || tplNotes || data.from.defaultNotes || "",
    internalNotes: "",
    lines: [],
  };
  return (
    <div className="max-w-5xl">
      <Link href={backOf(kind)} className="text-sm text-slate-600 underline dark:text-slate-400">← All {wordOf(kind)}s</Link>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50">New {wordOf(kind)}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        {isPo
          ? "Pick the buyer who sent the order, type their PO number in Reference, then add the items with their NDCs. Beside each item you'll see how many you have in stock."
          : kind === "SALES_ORDER"
            ? "Most sales orders are made from a sent quotation or a received purchase order (open it and press Make a sales order). To start one by hand, pick the buyer, type their PO number, and add the items. Its units are set aside for the buyer."
          : "Pick the buyer, then add items. Beside each item you'll see how many you have in stock and how many are still available to sell."}
      </p>
      <div className="mt-4">
        <DocEditor kind={kind} docId={null} number={null} base={baseOf(kind)} initial={initial} buyers={data.buyers} products={data.products} conditions={data.conditions} stock={data.stock} reserved={data.reserved} buyerPrices={data.buyerPrices} />
      </div>
    </div>
  );
}

export async function DocDetailPage({ kind, id, revise }: { kind: Kind; id: string; revise?: boolean }) {
  const org = await requireOrg();
  const found = await getDocument(org.organizationId, id);
  if (!found || found.doc.kind !== kind) notFound();
  if (kind === "SALES_ORDER" && !(await salesOrdersOn(org.organizationId))) notFound();
  const { doc, lines, payments } = found;
  const canWrite = canWriteSales(org.role, org.access);
  const isInvoice = kind === "INVOICE";
  const isPo = kind === "PURCHASE_ORDER";
  const word = wordOf(kind);
  const revEnabled = await purchaseOrdersEnabled(org.organizationId);
  const soEnabled = await salesOrdersOn(org.organizationId);
  const target = doc.convertedToId ? await getDocument(org.organizationId, doc.convertedToId) : null;
  const convertedToKind = target?.doc.kind === "SALES_ORDER" ? "SALES_ORDER" : target?.doc.kind === "INVOICE" ? "INVOICE" : null;
  const revising = revEnabled && !!revise && canWrite && !isInvoice && (doc.status === "SENT" || doc.status === "ACCEPTED");
  const history = isInvoice ? [] : await listRevisions(org.organizationId, "sales_doc", doc.id);
  const data = await loadEditorData(org.organizationId, doc.status === "DRAFT" ? doc.id : null);
  const status = shownStatus(doc, data.today);
  const actions = (
    <DocActions
      doc={{ id: doc.id, kind, status: doc.status, number: doc.number, buyerEmail: doc.buyerEmail ?? "", total: doc.total, amountPaid: doc.amountPaid, convertedToId: doc.convertedToId, convertedToKind, inventoryPosted: doc.inventoryPosted, emailedTo: doc.emailedTo, sentAt: doc.sentAt }}
      payments={payments.map((p) => ({ id: p.id, amount: p.amount, paidOn: p.paidOn, method: p.method ?? "", note: p.note ?? "" }))}
      today={data.today}
      canWrite={canWrite}
      canRevise={revEnabled}
      canMakeSo={soEnabled}
      base={baseOf(kind)}
    />
  );
  const head = (
    <div>
      <Link href={backOf(kind)} className="text-sm text-slate-600 underline dark:text-slate-400">← All {word}s</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="doc-title">{isInvoice ? `Invoice #${doc.number}` : isPo ? `Purchase order ${doc.number}` : kind === "SALES_ORDER" ? `Sales order ${doc.number}` : `Quotation ${doc.number}`}</h1>
        <StatusChip status={status} />
        {!!doc.revision && doc.revision > 0 && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200" data-testid="doc-revision">Revision {doc.revision}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400" data-testid="doc-sub">
        {doc.buyerCompany} · {fmtDay(doc.docDate)}
        {doc.sentAt ? ` · sent ${fmtDay(doc.sentAt)}${doc.emailedTo ? ` to ${doc.emailedTo}` : ""}` : ""}
      </p>
    </div>
  );

  if ((doc.status === "DRAFT" && canWrite) || revising) {
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
      lines: lines.map((l) => ({ productKey: l.productKey, productId: l.productId, productName: l.productName, condition: l.condition, groupKey: l.groupKey, groupLabel: l.groupLabel, quantity: String(l.quantity), unitPrice: String(l.unitPrice), note: l.note ?? "", ndc: l.ndc ?? "" })),
    };
    return (
      <div className="max-w-5xl space-y-5">
        {head}
        {revising ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="doc-revising">
            You are revising a {word} the buyer already has. Change what needs changing (or nothing), write what is different below, and send it. They get the PDF and an email marked Revision {(doc.revision ?? 0) + 1}.
          </p>
        ) : (
          actions
        )}
        <DocEditor revise={revising} kind={kind} docId={doc.id} number={doc.number} base={baseOf(kind)} initial={initial} buyers={data.buyers} products={data.products} conditions={data.conditions} stock={data.stock} reserved={data.reserved} buyerPrices={data.buyerPrices} />
      </div>
    );
  }

  // Shipping: shipments already made for an order or invoice, and a way to start one.
  const shipOn = (kind === "SALES_ORDER" || isInvoice) && canViewShipping(org.role, org.access) && (await shippingOn(org.organizationId));
  const made = shipOn ? await shipmentsForDocument(org.organizationId, doc.id) : [];
  const shipStrip = shipOn && (made.length > 0 || canShipFrom(doc.kind, doc.status)) ? (
    <div className={`${card} flex flex-wrap items-center gap-3 text-sm`} data-testid="doc-shipping">
      <span className="font-semibold text-slate-900 dark:text-slate-50">Shipping</span>
      {made.map((m) => (
        <Link key={m.id} href={`/dashboard/shipping/shipments/${m.id}`} className="underline" data-testid="doc-shipment-link">Shipment {m.seq} ({statusLabel(m.status)})</Link>
      ))}
      {made.length === 0 && <span className="text-slate-600 dark:text-slate-400">Not shipped yet.</span>}
      {canShipFrom(doc.kind, doc.status) && <Link href="/dashboard/shipping" className="ml-auto font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="doc-ship-link">{made.length === 0 ? "Ship this order" : "Ship more"}</Link>}
    </div>
  ) : null;

  // Sent, paid or void (or a role that can only look): the document as it was made.
  return (
    <div className="max-w-4xl space-y-5">
      {head}
      {actions}
      {shipStrip}
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
          {doc.dueDate && <p>{dueLabel(kind).replace(" date", "")}: {fmtDay(doc.dueDate)}</p>}
          {(isInvoice || kind === "SALES_ORDER") && doc.terms && <p>Terms: {doc.terms}</p>}
          {doc.reference && <p>{refShort(kind)}: {doc.reference}</p>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm" data-testid="doc-lines">
          <thead className="bg-sky-700 text-left text-xs uppercase tracking-wide text-white">
            <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">{hasNdcColumn(kind) ? "NDC" : "Expires"}</th><th className="px-3 py-2">Cond.</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800" data-testid="doc-line">
                <td className="px-3 py-2">{l.productName}</td>
                <td className="px-3 py-2 text-slate-500">{hasNdcColumn(kind) ? (l.ndc ?? "") : (l.expiryText ?? l.groupLabel ?? "")}</td>
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
      {history.length > 0 && (
        <div className={card} data-testid="doc-revisions">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revisions sent</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {history.map((r) => (
              <li key={r.id} data-testid="doc-revision-row">
                <span className="font-semibold">Revision {r.revision}</span>
                <span className="text-slate-500"> · {fmtDay(r.createdAt)}{r.emailedTo ? ` · emailed to ${r.emailedTo}` : ""}</span>
                <p className="whitespace-pre-line text-slate-700 dark:text-slate-300">{r.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {doc.customerNotes && <p className="whitespace-pre-line rounded-lg bg-white p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">{doc.customerNotes}</p>}
      {doc.internalNotes && canWrite && <p className="whitespace-pre-line rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"><strong>Private notes:</strong> {doc.internalNotes}</p>}
    </div>
  );
}
