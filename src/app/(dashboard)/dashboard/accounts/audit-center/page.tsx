import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { AUDIT_STATUSES, BUILT_TYPES, STATUS_LABEL, TYPE_BLURB, TYPE_LABEL, AUDIT_TYPES, isClosed, type AuditStatus, type AuditType } from "@/lib/audit-rules";
import { listAudits, statusCounts } from "@/lib/audit-service";
import { card, field, ghostBtn } from "@/components/sales-ui";
import { AuditList } from "./audit-list";

export const dynamic = "force-dynamic";

// Audit Center home (Accounts, Distribution operation only): start an audit, see how many are open in each stage, and search the history.
export default async function AuditCenterPage() {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) notFound();
  const [counts, recent] = await Promise.all([statusCounts(org.organizationId), listAudits(org.organizationId, {}, 12)]);
  const open = AUDIT_STATUSES.filter((s) => !isClosed(s)).reduce((n, s) => n + (counts[s] ?? 0), 0);
  const tiles: { status: AuditStatus; label: string }[] = [
    { status: "DEVICE_CONFIRMATION_NEEDED", label: "Waiting for clarification" },
    { status: "WAITING_FOR_INFORMATION", label: "Waiting for information" },
    { status: "READY_TO_GENERATE", label: "Ready to generate" },
    { status: "READY_TO_SEND", label: "Ready to send" },
    { status: "SENT", label: "Sent" },
    { status: "FOLLOW_UP_REQUIRED", label: "Follow-up required" },
    { status: "COMPLETE", label: "Completed" },
  ];
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Audit Center</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Answer a pharmacy, PBM or regulator audit in minutes. The records come straight from your pharmacy invoices; the Audit Center only reads them and never changes an invoice.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3" data-testid="audit-types">
        {AUDIT_TYPES.map((t: AuditType) =>
          BUILT_TYPES.includes(t) && acc.canWork ? (
            <Link key={t} href={`/dashboard/accounts/audit-center/new?type=${t}`} className={`${card} block hover:border-emerald-500`} data-testid={`start-${t}`}>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{TYPE_LABEL[t]}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{TYPE_BLURB[t]}</p>
              <p className="mt-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Start this audit →</p>
            </Link>
          ) : (
            <div key={t} className={`${card} opacity-70`} data-testid={`soon-${t}`}>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{TYPE_LABEL[t]}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{TYPE_BLURB[t]}</p>
              <p className="mt-3 text-sm font-medium text-slate-500">{BUILT_TYPES.includes(t) ? "View only for your role." : "Coming in the next update."}</p>
            </div>
          ),
        )}
      </div>

      <section className={card} data-testid="audit-counts">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Where your audits stand</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400"><span className="font-semibold text-slate-900 dark:text-slate-50" data-testid="open-count">{open}</span> open</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.status} href={`/dashboard/accounts/audit-center/history?status=${t.status}`} className="rounded-lg border border-slate-200 px-3 py-2 hover:border-emerald-500 dark:border-slate-800" data-testid={`count-${t.status}`}>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-50">{counts[t.status] ?? 0}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <form action="/dashboard/accounts/audit-center/history" className="flex flex-wrap gap-2" role="search">
        <label htmlFor="audit-search" className="sr-only">Search audits</label>
        <input id="audit-search" name="q" className={`${field} max-w-md`} placeholder="Search by case number, pharmacy, NCPDP, auditor or PBM" data-testid="audit-search" />
        <button className={ghostBtn}>Search</button>
        <Link href="/dashboard/accounts/audit-center/history" className={ghostBtn}>All audits</Link>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">Recent audits</h2>
        <AuditList rows={recent} empty="No audits yet. Start one above." />
      </section>
      <p className="text-xs text-slate-500 dark:text-slate-400">Status labels: {AUDIT_STATUSES.map((s) => STATUS_LABEL[s]).join(" · ")}</p>
    </div>
  );
}
