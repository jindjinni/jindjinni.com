import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { AUDIT_STATUSES, STATUS_LABEL, TYPE_LABEL, usDate, type AuditStatus, type AuditType } from "@/lib/audit-rules";
import { MISSING_LABEL, monthLabel, type Count, type MissingKind } from "@/lib/audit-insights";
import { dashboardData } from "@/lib/audit-insights-service";
import { card } from "@/components/sales-ui";

export const dynamic = "force-dynamic";

const TYPES: AuditType[] = ["INTERNAL", "PBM", "REGULATORY"];
const MISSING: MissingKind[] = ["ndc", "description", "invoiceNumber", "quantity", "date"];

// Chart colors: the first three slots of the platform's validated categorical palette, with a separate step for the dark surface.
const CSS = `
.audit-viz{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e3e2dc;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a}
@media (prefers-color-scheme:dark){.audit-viz{--surface:#1a1a19;--ink:#ffffff;--ink2:#c3c2b7;--grid:#34332f;--s1:#3987e5;--s2:#d95926;--s3:#199e70}}
.audit-viz .cols{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end;height:12rem;border-bottom:1px solid var(--grid)}
.audit-viz .col{display:flex;flex-direction:column-reverse;justify-content:flex-start;height:100%;position:relative}
.audit-viz .seg{border-top:2px solid var(--surface);min-height:0}
.audit-viz .seg:first-child{border-top:0;border-radius:0 0 0 0}
.audit-viz .tot{position:absolute;left:0;right:0;text-align:center;font-size:11px;color:var(--ink2);font-variant-numeric:tabular-nums}
.audit-viz .mon{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;margin-top:4px}
.audit-viz .mon span{font-size:10px;color:var(--ink2);text-align:center;white-space:nowrap;overflow:hidden}
.audit-viz .key{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2)}
.audit-viz .key i{display:inline-block;width:10px;height:10px;border-radius:2px}
.audit-viz .bar{height:8px;border-radius:0 4px 4px 0;background:var(--s1)}
`;

function Bars({ rows, testid, empty }: { rows: Count[]; testid: string; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-600 dark:text-slate-400">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-2" data-testid={testid}>
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,12rem)_1fr_2rem] items-center gap-2 text-sm" data-testid={`${testid}-row`}>
          <span className="truncate text-slate-800 dark:text-slate-100" title={r.name}>{r.name}</span>
          <span className="block"><span className="bar block" style={{ width: `${Math.max(3, (r.count / max) * 100)}%` }} /></span>
          <span className="text-right tabular-nums text-slate-900 dark:text-slate-50">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

// The Audit Center dashboard (read only): where open audits stand, audits over time, who asks most, and the data gaps that keep coming back.
export default async function AuditDashboardPage() {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) notFound();
  const d = await dashboardData(org.organizationId);
  const max = Math.max(1, ...d.months.map((m) => m.total));
  const statuses = AUDIT_STATUSES.filter((s) => d.open.byStatus[s]);
  const attention = d.open.due.OVERDUE + d.open.due.TODAY + d.open.due.SOON;

  return (
    <div className="audit-viz max-w-5xl space-y-6" data-testid="audit-dashboard">
      <style>{CSS}</style>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Audit dashboard</h1>
        <Link href="/dashboard/accounts/audit-center" className="text-sm text-emerald-800 underline dark:text-emerald-300">← Audit Center</Link>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">A read-only look across all your audits as of {usDate(d.today)}. Nothing here changes a case.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dash-tiles">
        {[
          ["Open audits", String(d.open.total), "dash-open"],
          ["Need attention", String(attention), "dash-attention"],
          ["Answers sent", String(d.totals.sent), "dash-sent"],
          ["Average days to answer", d.totals.averageDays === null ? "—" : String(d.totals.averageDays), "dash-avg"],
        ].map(([t, v, id]) => (
          <div key={id} className={card}>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid={id}>{v}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{t}</p>
          </div>
        ))}
      </div>

      <section className={card} data-testid="dash-open-section">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Open audits by stage and due date</h2>
        {d.open.total === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400" data-testid="dash-open-empty">Nothing is open right now.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <ul className="space-y-1 text-sm" data-testid="dash-by-status">
              {statuses.map((s: AuditStatus) => (
                <li key={s} className="flex justify-between gap-2">
                  <Link href={`/dashboard/accounts/audit-center/history?status=${s}`} className="text-slate-800 underline-offset-2 hover:underline dark:text-slate-100">{STATUS_LABEL[s]}</Link>
                  <span className="tabular-nums text-slate-900 dark:text-slate-50" data-testid={`dash-status-${s}`}>{d.open.byStatus[s]}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-sm" data-testid="dash-by-due">
              {([["OVERDUE", "Overdue"], ["TODAY", "Due today"], ["SOON", "Due within a week"], ["LATER", "Due later"], ["NONE", "No due date"], ["DONE", "Answer sent, follow-up open"]] as const).map(([k, t]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className={k === "OVERDUE" && d.open.due.OVERDUE > 0 ? "font-semibold text-red-700 dark:text-red-300" : "text-slate-800 dark:text-slate-100"}>{t}</span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-50" data-testid={`dash-due-${k}`}>{d.open.due[k]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={card} data-testid="dash-months-section">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Audits started, last 12 months</h2>
          <div className="flex flex-wrap gap-3" data-testid="dash-legend">
            {TYPES.map((t, i) => <span key={t} className="key"><i style={{ background: `var(--s${i + 1})` }} />{TYPE_LABEL[t]} · {d.totals.byType[t] ?? 0} in all</span>)}
          </div>
        </div>
        <div className="mt-6" role="img" aria-label="Audits started per month, split by type. The numbers are in the table below.">
          <div className="cols" data-testid="dash-cols">
            {d.months.map((m) => (
              <div key={m.month} className="col" data-testid="dash-col" data-month={m.month} data-total={m.total} title={`${monthLabel(m.month)}: ${m.total}`}>
                {TYPES.map((t, i) => (m[t] > 0 ? <div key={t} className="seg" style={{ height: `${(m[t] / max) * 100}%`, background: `var(--s${i + 1})` }} /> : null))}
                {m.total > 0 && <span className="tot" style={{ bottom: `calc(${(m.total / max) * 100}% + 2px)` }}>{m.total}</span>}
              </div>
            ))}
          </div>
          <div className="mon">{d.months.map((m) => <span key={m.month}>{monthLabel(m.month)}</span>)}</div>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-200">Show the numbers</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="dash-table">
              <thead><tr className="text-xs text-slate-600 dark:text-slate-400"><th className="py-1 pr-4 font-medium">Month</th>{TYPES.map((t) => <th key={t} className="py-1 pr-4 text-right font-medium">{TYPE_LABEL[t]}</th>)}<th className="py-1 text-right font-medium">All</th></tr></thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.month} className="border-t border-slate-200 dark:border-slate-800" data-testid="dash-table-row">
                    <td className="py-1 pr-4 text-slate-800 dark:text-slate-100">{monthLabel(m.month)}</td>
                    {TYPES.map((t) => <td key={t} className="py-1 pr-4 text-right tabular-nums text-slate-800 dark:text-slate-100">{m[t]}</td>)}
                    <td className="py-1 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">{m.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} data-testid="dash-pharmacies-section">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Pharmacies with the most audits</h2>
          <Bars rows={d.pharmacies} testid="dash-pharmacies" empty="No audits yet." />
        </section>
        <section className={card} data-testid="dash-auditors-section">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Who asks most (PBM, agency or auditor)</h2>
          <Bars rows={d.auditors} testid="dash-auditors" empty="No auditor names on any case yet." />
        </section>
      </div>

      <section className={card} data-testid="dash-gaps-section">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Data gaps in the files you generated</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          From the newest file of {d.gaps.cases} {d.gaps.cases === 1 ? "audit" : "audits"} started in the last 12 months ({d.gaps.rows} {d.gaps.rows === 1 ? "line" : "lines"}). Fix the product or invoice once and every later audit is clean.
        </p>
        {d.gaps.cases === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400" data-testid="dash-gaps-empty">No files generated yet.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <ul className="space-y-1 text-sm" data-testid="dash-gaps">
              {MISSING.map((k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="text-slate-800 dark:text-slate-100">{MISSING_LABEL[k]}</span>
                  <span className={`tabular-nums ${d.gaps.byKind[k] > 0 ? "font-semibold text-amber-800 dark:text-amber-300" : "text-slate-900 dark:text-slate-50"}`} data-testid={`dash-gap-${k}`}>{d.gaps.byKind[k]}</span>
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">Products most often missing an NDC</p>
              <Bars rows={d.gaps.products} testid="dash-gap-products" empty="None. Every line had an NDC." />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
