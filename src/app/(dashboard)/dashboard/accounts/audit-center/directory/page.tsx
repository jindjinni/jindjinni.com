import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { AUDITOR_KIND_LABEL, isAuditorKind } from "@/lib/audit-insights";
import { listAuditors } from "@/lib/audit-insights-service";
import { card } from "@/components/sales-ui";
import { AuditorForm, HideButton } from "./directory-forms";

export const dynamic = "force-dynamic";

// Auditors & agencies: the people who ask for audits, saved once so starting an audit can fill them in. Hidden, never deleted.
export default async function AuditDirectoryPage() {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) notFound();
  const [rows, hidden] = await Promise.all([listAuditors(org.organizationId), listAuditors(org.organizationId, { hidden: true })]);
  const blank = { id: null, kind: "PBM", name: "", company: "", email: "", phone: "", notes: "" };
  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Auditors &amp; agencies</h1>
        <Link href="/dashboard/accounts/audit-center" className="text-sm text-emerald-800 underline dark:text-emerald-300">← Audit Center</Link>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">Save the PBM auditors, state boards and federal agencies you answer. When you start an audit, pick one and their details fill in. Old audits keep the details they were started with, whatever you change here.</p>

      {acc.canWork && (
        <details className={card} data-testid="dir-add">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-50">Add an auditor or agency</summary>
          <div className="mt-3"><AuditorForm v={blank} canWork onDoneLabel="Add to directory" /></div>
        </details>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400" data-testid="dir-empty">No one saved yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="dir-list">
          {rows.map((a) => (
            <li key={a.id}>
              <details className={card} data-testid="dir-row">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-50" data-testid="dir-title">{a.company || a.name}</span>
                  {a.company && a.name && <span className="text-slate-700 dark:text-slate-300">{a.name}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{isAuditorKind(a.kind) ? AUDITOR_KIND_LABEL[a.kind] : a.kind}</span>
                  {a.email && <span className="text-slate-600 dark:text-slate-400">{a.email}</span>}
                </summary>
                <div className="mt-3 space-y-3">
                  <AuditorForm v={{ id: a.id, kind: a.kind, name: a.name ?? "", company: a.company ?? "", email: a.email ?? "", phone: a.phone ?? "", notes: a.notes ?? "" }} canWork={acc.canWork} />
                  {acc.canWork && <HideButton id={a.id} hidden={false} />}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {hidden.length > 0 && (
        <details className={card} data-testid="dir-hidden">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">Hidden ({hidden.length})</summary>
          <ul className="mt-3 space-y-2">
            {hidden.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-800 dark:text-slate-100">{a.company || a.name}{a.email ? ` · ${a.email}` : ""}</span>
                {acc.canWork && <HideButton id={a.id} hidden />}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
