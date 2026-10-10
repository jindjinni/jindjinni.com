import Link from "next/link";
import { STATUS_LABEL, TYPE_LABEL, isAuditStatus, isAuditType, usDate } from "@/lib/audit-rules";
import type { AuditRow } from "@/lib/audit-service";

const TONE: Record<string, string> = {
  DEVICE_CONFIRMATION_NEEDED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  WAITING_FOR_INFORMATION: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  READY_TO_SEND: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  SENT: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  FOLLOW_UP_REQUIRED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  COMPLETE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  CANCELLED: "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
};

export function AuditStatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`} data-testid="audit-status" data-status={status}>
      {isAuditStatus(status) ? STATUS_LABEL[status] : status}
    </span>
  );
}

/** One line per audit; the case number opens the case. */
export function AuditList({ rows, empty }: { rows: AuditRow[]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400" data-testid="audit-empty">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" data-testid="audit-list">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/dashboard/accounts/audit-center/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" data-testid="audit-row">
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-50" data-testid="audit-case">{r.caseNumber}</span>
            <span className="text-slate-800 dark:text-slate-100">{r.pharmacyName}</span>
            <span className="text-slate-600 dark:text-slate-400">{isAuditType(r.auditType) ? TYPE_LABEL[r.auditType] : r.auditType}</span>
            <span className="text-slate-600 dark:text-slate-400">{usDate(r.startDate)} – {usDate(r.endDate)}</span>
            {r.pharmacyNcpdp && <span className="text-slate-600 dark:text-slate-400">NCPDP {r.pharmacyNcpdp}</span>}
            <span className="ml-auto"><AuditStatusChip status={r.status} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
