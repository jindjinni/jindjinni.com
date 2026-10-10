import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { STATUS_LABEL, TYPE_LABEL, isAuditType, isClosed, safeguards, usDate, type AuditType, type ColumnDef } from "@/lib/audit-rules";
import { getAudit, listAttachments, listEvents, listVersions, previewAudit, productsSold, searchPharmacies, suggestedSubject } from "@/lib/audit-service";
import { card } from "@/components/sales-ui";
import { AuditStatusChip } from "../audit-list";
import { AttachForm, EditAuditForm, GenerateButton, MarkSentForm, NoteForm, ReopenForm, StatusButtons } from "./case-forms";

export const dynamic = "force-dynamic";

const PREVIEW_ROWS = 100;
const fmtCell = (c: ColumnDef, v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "date" && typeof v === "string") return usDate(v);
  if (c.kind === "money" && typeof v === "number") return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return String(v);
};
const when = (iso: string) => new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

// One audit case: who asked, which pharmacy and dates, the preview of what will be exported, the saved Excel versions, what was sent, the notes
// and the full trail. The invoices themselves are only read here, never changed.
export default async function AuditCasePage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) notFound();
  const { id } = await params;
  const audit = await getAudit(org.organizationId, id);
  if (!audit || !isAuditType(audit.auditType)) notFound();
  const type = audit.auditType as AuditType;
  const closed = isClosed(audit.status);
  const editable = acc.canWork && !closed;

  const [preview, versions, attachments, events, pharmacies] = await Promise.all([
    previewAudit(org.organizationId, audit),
    listVersions(org.organizationId, id),
    listAttachments(org.organizationId, id),
    listEvents(org.organizationId, id),
    searchPharmacies(org.organizationId, ""),
  ]);
  const products = editable && audit.buyerId && audit.startDate && audit.endDate ? await productsSold(org.organizationId, audit.buyerId, audit.startDate, audit.endDate) : [];
  const guard = safeguards(type);
  const selectedKeys: string[] = audit.productKeysJson ? (JSON.parse(audit.productKeysJson) as string[]) : [];
  const verList = versions.map((v) => ({ ...v, moneyFree: (() => { try { return !!JSON.parse(v.filtersJson ?? "{}").moneyFree; } catch { return false; } })() }));
  const canGenerate = editable && preview.blockers.length === 0;
  const warnByCode = new Map<string, number>();
  for (const w of preview.warnings) warnByCode.set(w.label, (warnByCode.get(w.label) ?? 0) + 1);
  const sentVersion = verList.find((v) => v.sentAt);
  const showSend = editable && verList.length > 0 && audit.status !== "SENT" && audit.status !== "FOLLOW_UP_REQUIRED";

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href="/dashboard/accounts/audit-center" className="text-sm text-emerald-800 underline dark:text-emerald-300">← Audit Center</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="case-number">{audit.caseNumber}</h1>
          <AuditStatusChip status={audit.status} />
          <span className="text-sm text-slate-600 dark:text-slate-400">{TYPE_LABEL[type]}</span>
        </div>
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-100" data-testid="case-pharmacy">
          {audit.pharmacyName}
          {audit.pharmacyNcpdp && <> · NCPDP <strong data-testid="case-ncpdp">{audit.pharmacyNcpdp}</strong></>}
          {" · "}{usDate(audit.startDate)} – {usDate(audit.endDate)}
        </p>
      </div>

      {audit.status === "DEVICE_CONFIRMATION_NEEDED" && (
        <p className="rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="alert" data-testid="device-hold">
          Contact the auditor or requesting party and confirm whether medical-device purchase records are required before generating the report. Change the answer below once you know.
        </p>
      )}

      <section className={`${card} space-y-3`} data-testid="preview">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Audit summary</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Invoices", preview.summary.invoices, "sum-invoices"], ["Transactions", preview.summary.rows, "sum-rows"], ["Products", preview.summary.products, "sum-products"], ["Total quantity", preview.summary.units, "sum-units"]].map(([k, v, t]) => (
            <div key={String(k)}><dt className="text-xs text-slate-600 dark:text-slate-400">{k}</dt><dd className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid={String(t)}>{v}</dd></div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full px-2 py-1 ${guard.locked ? "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-100" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`} data-testid="chip-pricing">Pricing: {guard.pricing === "excluded" ? "🔒 LOCKED — EXCLUDED" : "INCLUDED"}</span>
          <span className={`rounded-full px-2 py-1 ${guard.locked ? "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-100" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`} data-testid="chip-shipping">Shipping: {guard.shipping === "excluded" ? "🔒 LOCKED — EXCLUDED" : "INCLUDED"}</span>
          {type !== "INTERNAL" && <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900 dark:bg-sky-950 dark:text-sky-200" data-testid="chip-device">Device audit: {audit.deviceAnswer === "YES" ? "YES" : audit.deviceAnswer === "NO" ? "NO" : "NOT CONFIRMED"}</span>}
        </div>

        {preview.blockers.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100" data-testid="blockers">
            {preview.blockers.map((b) => <li key={b}>• {b}</li>)}
          </ul>
        )}
        {preview.warnings.length > 0 && (
          <details className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" data-testid="warnings">
            <summary className="cursor-pointer font-medium">⚠ {preview.warnings.length} data warning{preview.warnings.length === 1 ? "" : "s"} — these lines stay in the file; fix the product or invoice if you can</summary>
            <ul className="mt-2 space-y-0.5">
              {[...warnByCode.entries()].map(([k, n]) => <li key={k}>{k}: {n} line{n === 1 ? "" : "s"}</li>)}
            </ul>
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs">
              {preview.warnings.slice(0, 100).map((w, i) => <li key={`${w.lineId}-${i}`}>{w.label} — {w.invoiceNumber ?? "no invoice number"} · {w.productName}</li>)}
            </ul>
          </details>
        )}

        {preview.rows.length > 0 && (
          <details data-testid="preview-rows">
            <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100">Preview records ({preview.rows.length}{preview.rows.length > PREVIEW_ROWS ? `, first ${PREVIEW_ROWS} shown` : ""})</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-xs" data-testid="preview-table">
                <thead><tr>{preview.columns.map((c) => <th key={c.key} className="whitespace-nowrap border-b border-slate-300 px-2 py-1 font-semibold dark:border-slate-700" data-col={c.key}>{c.header}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i} className="odd:bg-slate-50 dark:odd:bg-slate-800/40">{preview.columns.map((c) => <td key={c.key} className="whitespace-nowrap px-2 py-1">{fmtCell(c, r[c.key])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        {editable && <GenerateButton auditId={id} disabled={!canGenerate} reason={preview.blockers[0]} hasFile={verList.length > 0} />}
      </section>

      <section className={`${card} space-y-2`} data-testid="versions">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Excel files</h2>
        {verList.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-400">No file has been generated yet.</p> : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {verList.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm" data-testid="version-row">
                <span className="font-semibold">Version {v.version}</span>
                <a href={`/api/accounts/audit/version/${v.id}`} className="text-emerald-800 underline dark:text-emerald-300" data-testid="download-version">{v.fileName}</a>
                <span className="text-slate-600 dark:text-slate-400">{v.rowCount} rows · {v.templateVersion} · {v.createdByName ?? "someone"} · {when(v.createdAt)}</span>
                {v.sentAt && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200" data-testid="version-sent">Sent {when(v.sentAt)}</span>}
                <span className="font-mono text-[11px] text-slate-500" title="Fingerprint of the exact file">{v.fileHash.slice(0, 12)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(audit.sentAt || sentVersion) && (
        <section className={`${card} space-y-1 text-sm`} data-testid="sent-record">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Sent</h2>
          <p>To <strong>{audit.sentTo}</strong>{audit.sentCc ? <>, copy to {audit.sentCc}</> : null}{audit.sentSubject ? <> · “{audit.sentSubject}”</> : null}</p>
          <p className="text-slate-600 dark:text-slate-400">{audit.sentAt ? when(audit.sentAt) : ""}{sentVersion ? ` · version ${sentVersion.version}` : ""}</p>
        </section>
      )}

      {showSend && (
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">Record that it was sent</h2>
          <MarkSentForm
            auditId={id}
            c={{
              versions: verList.map((v) => ({ id: v.id, label: `Version ${v.version} — ${v.fileName}`, clean: v.moneyFree })),
              type,
              ncpdp: audit.pharmacyNcpdp,
              deviceYes: audit.deviceAnswer === "YES",
              auditorEmail: audit.auditorEmail ?? "",
              pharmacyEmail: audit.pharmacyEmail ?? "",
              subject: suggestedSubject(audit),
              defaultTo: type === "INTERNAL" ? audit.pharmacyEmail ?? "" : audit.auditorEmail ?? "",
              defaultCc: type === "PBM" ? audit.pharmacyEmail ?? "" : "",
              hasDates: !!audit.startDate && !!audit.endDate,
            }}
          />
        </section>
      )}

      {acc.canWork && !closed && (audit.sentAt || audit.status === "FOLLOW_UP_REQUIRED") && <StatusButtons auditId={id} sent={!!audit.sentAt} followUp={audit.status === "FOLLOW_UP_REQUIRED"} canCancel={acc.isManager} />}
      {acc.isManager && !closed && !audit.sentAt && <StatusButtons auditId={id} sent={false} followUp={false} canCancel />}
      {acc.isManager && closed && <ReopenForm auditId={id} />}

      {editable && (
        <details className={card} data-testid="edit-section">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-50">Change the request, dates or products</summary>
          <div className="mt-3">
            <EditAuditForm
              auditId={id}
              pharmacies={pharmacies.map((p) => ({ id: p.id, name: p.name, ncpdp: p.ncpdp }))}
              products={products}
              v={{
                type, buyerId: audit.buyerId ?? "", startDate: audit.startDate ?? "", endDate: audit.endDate ?? "", deviceAnswer: audit.deviceAnswer ?? "UNCLEAR",
                productScope: audit.productScope === "SELECTED" ? "SELECTED" : "ALL", productKeys: selectedKeys, includePharmacy: audit.includePharmacy,
                auditorName: audit.auditorName ?? "", auditorCompany: audit.auditorCompany ?? "", auditorEmail: audit.auditorEmail ?? "", auditorPhone: audit.auditorPhone ?? "",
                pbmName: audit.pbmName ?? "", agency: audit.agency ?? "", referenceNumber: audit.referenceNumber ?? "", requestReceivedOn: audit.requestReceivedOn ?? "", dueOn: audit.dueOn ?? "",
              }}
            />
          </div>
        </details>
      )}

      <section className={`${card} space-y-3`} data-testid="attachments">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Documents</h2>
        {attachments.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-400">No documents attached.</p> : (
          <ul className="space-y-1 text-sm">
            {attachments.map((a) => (
              <li key={a.id} data-testid="attachment-row">
                <a href={`/api/accounts/audit/attachment/${a.id}`} className="text-emerald-800 underline dark:text-emerald-300">{a.fileName}</a>
                <span className="text-slate-600 dark:text-slate-400"> · {a.kind === "REQUEST" ? "original request" : "document"} · {a.uploadedByName ?? ""} · {when(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {editable && <AttachForm auditId={id} />}
      </section>

      <section className={`${card} space-y-3`} data-testid="trail">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Notes and audit trail</h2>
        {acc.canWork && <NoteForm auditId={id} />}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100">History ({events.length})</summary>
          <ul className="mt-2 space-y-1 text-sm" data-testid="event-list">
            {events.map((e) => (
              <li key={e.id} data-kind={e.kind} className={e.kind === "NOTE" ? "rounded-md bg-amber-50 p-2 dark:bg-amber-950/40" : ""}>
                <span className="text-slate-500">{when(e.createdAt)} · {e.userName ?? "someone"} · </span>
                <span className="font-medium">{e.kind === "NOTE" ? "Note" : e.kind.replace("_", " ").toLowerCase()}</span>
                {e.detail ? <span> — {e.detail}</span> : null}
                {(e.oldValue || e.newValue) && <span className="text-slate-600 dark:text-slate-400"> ({e.oldValue ? (isStatusKind(e.kind, e.oldValue) ? STATUS_LABEL[e.oldValue as keyof typeof STATUS_LABEL] : e.oldValue) : "—"} → {e.newValue ? (isStatusKind(e.kind, e.newValue) ? STATUS_LABEL[e.newValue as keyof typeof STATUS_LABEL] : e.newValue) : "—"})</span>}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

const isStatusKind = (kind: string, v: string) => (kind === "STATUS" || kind === "REOPENED") && v in STATUS_LABEL;
