import Link from "next/link";
import { notFound } from "next/navigation";
import { card, fmtDay } from "@/components/sales-ui";
import { getShipment } from "@/lib/shipping-service";
import { listContacts } from "@/lib/shipping-contacts";
import { getOrganization, hasShipFromAddress } from "@/lib/queries";
import { resolveShippo } from "@/lib/shippo-connection";
import { addressLines } from "@/lib/shipping-address-rules";
import { docLabel, isOrderKind, statusLabel } from "@/lib/shipping-rules";
import { pillClass } from "@/lib/tracking-rules";
import { requireShipping } from "../../gate";
import { BoxesPanel, DetailsPanel, EmailPanel, FilesPanel, LabelsPanel, ShipToPanel } from "./ship-panels";

export const dynamic = "force-dynamic";

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, canWrite } = await requireShipping();
  const { id } = await params;
  const d = await getShipment(org.organizationId, id, { sync: true });
  if (!d) notFound();
  const s = d.shipment;
  const handled = s.emailStatus === "SENT" || s.emailStatus === "SKIPPED" || s.emailStatus === "SENDING";
  const [contacts, orgRow, shippo] = await Promise.all([listContacts(org.organizationId), getOrganization(org.organizationId), resolveShippo(org.organizationId)]);
  const addr = {
    name: d.shipTo.name, company: d.shipTo.company ?? "", street1: d.shipTo.street1, street2: d.shipTo.street2 ?? "", city: d.shipTo.city, state: d.shipTo.state, zip: d.shipTo.zip,
    phone: d.shipTo.phone ?? "", email: s.buyerEmail ?? "", isResidential: s.toResidential,
  };
  const names: string[] = s.emailAttachments ? (JSON.parse(s.emailAttachments) as string[]) : [];
  const title = s.buyerCompany || s.toCompany || s.toName || "Shipment";
  return (
    <div className="max-w-4xl space-y-5" data-testid="shipment-page">
      <Link href="/dashboard/shipping/shipments" className="text-sm text-slate-600 underline dark:text-slate-400">← Shipments</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="shipment-title">{title}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillClass(s.status)}`} data-testid="shipment-status">{statusLabel(s.status)}</span>
        <span className="text-xs text-slate-500" data-testid="shipment-stage">{d.stage}</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="shipment-sub">
        {docLabel(s.docKind, s.docNumber)}{s.reference ? ` · PO ${s.reference}` : ""}{s.reason ? ` · ${s.reason}` : ""} · shipment {s.seq} · {fmtDay(s.shipDate)}
        {s.documentId && (
          <> · <Link href={`/dashboard/sales/${s.docKind === "INVOICE" ? "invoices" : "sales-orders"}/${s.documentId}`} className="underline">Open the {s.docKind === "INVOICE" ? "invoice" : "order"}</Link></>
        )}
      </p>

      <ShipToPanel
        shipmentId={s.id}
        address={addr}
        lines={addressLines(d.shipTo)}
        contactId={s.contactId}
        options={contacts.map((c) => ({ id: c.id, label: c.company ? `${c.company}${c.name !== c.company ? ` - ${c.name}` : ""}` : c.name, kind: c.kind }))}
        locked={handled}
        canWrite={canWrite}
        problem={d.addressProblem}
      />

      <BoxesPanel
        shipmentId={s.id}
        boxes={d.boxes.map((b) => ({ id: b.id, carrier: b.carrier, trackingNumber: b.trackingNumber, status: b.status, statusDetails: b.statusDetails, location: b.location, eta: b.eta, lastError: b.lastError, followAuto: b.followAuto, labelUrl: b.labelUrl, labelService: b.labelService, labelCost: b.labelCost }))}
        locked={handled}
        canWrite={canWrite}
        trackingConnected={shippo.ok}
      />

      <LabelsPanel
        shipmentId={s.id}
        canWrite={canWrite}
        shippoReady={shippo.ok}
        shippoWhy={shippo.ok ? null : shippo.message}
        fromReady={hasShipFromAddress(orgRow)}
        addressProblem={d.addressProblem}
      />

      <FilesPanel
        shipmentId={s.id}
        files={d.files.map((f) => ({ id: f.id, filename: f.filename, kind: f.kind, sizeBytes: f.sizeBytes, attach: f.attach, isImage: f.contentType.startsWith("image/") }))}
        locked={handled}
        canWrite={canWrite}
      />

      <DetailsPanel shipmentId={s.id} shipDate={s.shipDate} buyerEmail={s.buyerEmail ?? ""} buyerContact={s.buyerContact ?? ""} locked={handled} canWrite={canWrite} />

      {s.emailStatus === "SENT" || s.emailStatus === "SKIPPED" ? (
        <div className={`${card} space-y-2`} data-testid="email-handled">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{s.emailStatus === "SENT" ? `Emailed to ${s.emailTo}` : "Set aside, no email sent"}</p>
          <p className="text-xs text-slate-500">{s.emailByName ?? "Someone"} · {(s.emailAt ?? "").slice(0, 16).replace("T", " ")} UTC{s.emailStatus === "SKIPPED" && s.emailNote ? ` · ${s.emailNote}` : ""}</p>
          {s.emailStatus === "SENT" && (
            <>
              <p className="text-sm"><span className="text-slate-500">Subject: </span><span data-testid="email-sent-subject">{s.emailSubject}</span></p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200" data-testid="email-sent-body">{s.emailBody}</pre>
              {names.length > 0 && <p className="text-xs text-slate-500" data-testid="email-sent-files">Attached: {names.join(", ")}</p>}
            </>
          )}
        </div>
      ) : s.emailStatus === "SENDING" ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="email-sending">This email is being sent right now.</p>
      ) : (
        <EmailPanel
          shipmentId={s.id}
          to={s.buyerEmail ?? ""}
          docKind={s.docKind}
          docNumber={s.docNumber}
          reference={s.reference}
          reason={s.reason}
          company={s.buyerCompany ?? s.toCompany ?? ""}
          contact={s.buyerContact}
          shipDate={s.shipDate}
          boxes={d.boxes.map((b) => ({ carrier: b.carrier, trackingNumber: b.trackingNumber }))}
          items={isOrderKind(s.docKind) ? d.items : []}
          files={d.files.map((f) => ({ id: f.id, filename: f.filename, sizeBytes: f.sizeBytes, attach: f.attach }))}
          sender={d.sender}
          hasOrder={!!s.documentId}
          hasInvoice={!!s.invoiceDocumentId && s.invoiceDocumentId !== s.documentId}
          canSend={canWrite}
        />
      )}
    </div>
  );
}
