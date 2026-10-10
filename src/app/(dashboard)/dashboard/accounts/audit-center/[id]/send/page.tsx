import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { TYPE_LABEL, isAuditType, isClosed, usDate, type AuditType } from "@/lib/audit-rules";
import { getAudit } from "@/lib/audit-service";
import { reviewData } from "@/lib/audit-send";
import { card, field, ghostBtn } from "@/components/sales-ui";
import { SendAuditForm } from "./send-form";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

// REVIEW EMAIL & ATTACHMENTS: the last stop before an audit leaves. Who it goes to, the subject and message (all editable), exactly which files
// go with it, and the checklist that must be all green before Send works. Nothing here sends by itself.
export default async function SendAuditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed || !acc.canWork) notFound();
  const { id } = await params;
  const audit = await getAudit(org.organizationId, id);
  if (!audit || !isAuditType(audit.auditType)) notFound();
  const type = audit.auditType as AuditType;
  const raw = (await searchParams).v;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const data = await reviewData(org.organizationId, audit, wanted ?? null);
  const back = `/dashboard/accounts/audit-center/${id}`;

  if (isClosed(audit.status) || !data.versionId) {
    return (
      <div className="max-w-3xl space-y-3">
        <Link href={back} className="text-sm text-emerald-800 underline dark:text-emerald-300">← {audit.caseNumber}</Link>
        <p className={card} data-testid="send-unavailable">{isClosed(audit.status) ? "This audit is closed. Reopen it to send." : "Generate the Excel file first, then come back to send it."}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href={back} className="text-sm text-emerald-800 underline dark:text-emerald-300">← {audit.caseNumber}</Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="send-title">Review email &amp; attachments</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {TYPE_LABEL[type]} · {audit.pharmacyName} · {usDate(audit.startDate)} – {usDate(audit.endDate)}. Check every line, then press Send. The email goes from your company&apos;s own mailbox.
        </p>
      </div>

      {data.versions.length > 1 && (
        <form method="get" className={`${card} flex flex-wrap items-end gap-2`} data-testid="version-picker">
          <div>
            <label htmlFor="v" className="text-xs font-medium text-slate-700 dark:text-slate-300">Excel file version</label>
            <select id="v" name="v" defaultValue={data.versionId} className={`${field} mt-1`}>
              {data.versions.map((v) => <option key={v.id} value={v.id}>Version {v.version} — {v.fileName}</option>)}
            </select>
          </div>
          <button className={ghostBtn}>Use this version</button>
        </form>
      )}

      <SendAuditForm
        key={data.versionId}
        auditId={id}
        type={type}
        versionId={data.versionId}
        version={data.versions.find((v) => v.id === data.versionId)!}
        defaults={data.defaults}
        attachments={data.attachments}
        invoices={data.invoices}
        mailbox={data.mailbox}
        isManager={acc.isManager}
        back={back}
      />
    </div>
  );
}
