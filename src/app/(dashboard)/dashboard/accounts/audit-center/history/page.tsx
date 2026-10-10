import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { AUDIT_STATUSES, AUDIT_TYPES, STATUS_LABEL, TYPE_LABEL } from "@/lib/audit-rules";
import { listAudits } from "@/lib/audit-service";
import { field, ghostBtn } from "@/components/sales-ui";
import { AuditList } from "../audit-list";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Audit History: every audit ever made, searchable by case number, pharmacy, NCPDP, auditor, PBM or agency, and filterable.
export default async function AuditHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) notFound();
  const sp = await searchParams;
  const f = { q: one(sp.q), type: one(sp.type), status: one(sp.status), from: one(sp.from), to: one(sp.to) };
  const rows = await listAudits(org.organizationId, f, 300);
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Audit History</h1>
        <Link href="/dashboard/accounts/audit-center" className="text-sm text-emerald-800 underline dark:text-emerald-300">← Audit Center</Link>
      </div>
      <form className="grid gap-2 sm:grid-cols-6" data-testid="audit-filters">
        <input name="q" defaultValue={f.q} className={`${field} sm:col-span-2`} placeholder="Case number, pharmacy, NCPDP, auditor…" aria-label="Search audits" />
        <select name="type" defaultValue={f.type} className={field} aria-label="Audit type">
          <option value="">Any type</option>
          {AUDIT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select name="status" defaultValue={f.status} className={field} aria-label="Status">
          <option value="">Any status</option>
          {AUDIT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input name="from" type="date" defaultValue={f.from} className={field} aria-label="Created from" />
        <input name="to" type="date" defaultValue={f.to} className={field} aria-label="Created to" />
        <button className={`${ghostBtn} sm:col-span-6 sm:w-fit`}>Filter</button>
      </form>
      <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="audit-total">{rows.length} audit{rows.length === 1 ? "" : "s"}</p>
      <AuditList rows={rows} empty="No audits match." />
    </div>
  );
}
