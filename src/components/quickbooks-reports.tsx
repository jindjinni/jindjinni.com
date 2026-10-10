import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { accountingView } from "@/lib/quickbooks";
import { latestSnapshots, quickbooksOn } from "@/lib/quickbooks-service";
import { SHOW_ROWS, REPORT_META, kindsFor, looksLikeMoney } from "@/lib/quickbooks-rules";
import { canPullReports, canSeeReport } from "@/lib/quickbooks-access";
import { isAdmin } from "@/lib/permissions";
import { ConnectGuide } from "@/components/connect-guide";
import { QbActions } from "@/components/qb-actions";

const utc = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

/**
 * The QuickBooks tab of Sales and Accounts: saved copies of QuickBooks reports. This page only reads the saved copies; pulling a
 * fresh one or uploading a file are separate actions. Sales sees who has paid and who owes; profit and loss is Accounts only.
 */
export async function QuickBooksReports({ dept }: { dept: "sales" | "accounts" }) {
  const org = await requireOrg();
  if (!(await quickbooksOn(org.organizationId))) notFound();
  const kinds = kindsFor(dept).filter((k) => canSeeReport(org.role, org.access, k));
  if (kinds.length === 0) notFound();
  const [view, snaps] = await Promise.all([accountingView(org.organizationId), latestSnapshots(org.organizationId, kinds)]);
  const canPull = canPullReports(org.role, org.access);
  const online = view.connected && view.status === "ACTIVE";

  return (
    <div className="flex max-w-5xl flex-col gap-6" data-testid="qb-page">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">QuickBooks</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Copies of {org.organizationName}&apos;s QuickBooks reports. They are as of the time shown; QuickBooks stays your official record, so check anything important there. The platform only reads from QuickBooks and never changes it.
        </p>
        <p className="mt-2 text-sm" data-testid="qb-status">
          {online ? (
            <span className="text-emerald-700 dark:text-emerald-400">Connected to QuickBooks Online{view.companyName ? ` (${view.companyName})` : ""}.</span>
          ) : view.connected ? (
            <span className="text-red-700 dark:text-red-400">QuickBooks needs to be reconnected. {isAdmin(org.role) ? <Link className="underline" href="/dashboard/settings/connectors#quickbooks">Reconnect it in Settings</Link> : "Ask an owner or admin to reconnect it."}</span>
          ) : (
            <span className="text-slate-600 dark:text-slate-400">
              Not connected to QuickBooks Online. {isAdmin(org.role) ? <Link className="underline" href="/dashboard/settings/connectors#quickbooks">Connect it in Settings</Link> : "An owner or admin can connect it."} If you use QuickBooks Desktop or Enterprise, upload an exported report below instead.
            </span>
          )}
        </p>
      </div>

      {kinds.map((kind) => {
        const meta = REPORT_META[kind];
        const snap = snaps[kind];
        const shown = snap ? snap.table.rows.slice(0, SHOW_ROWS) : [];
        const boldSet = new Set(snap?.table.bold ?? []);
        return (
          <section key={kind} className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid={`qb-report-${kind}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{meta.label}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{meta.blurb}</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300" data-testid={`qb-source-${kind}`}>
              {snap
                ? snap.source === "QBO"
                  ? `From QuickBooks Online · ${snap.periodLabel ?? ""} · pulled ${utc(snap.takenAt)}${snap.takenByName ? ` by ${snap.takenByName}` : ""}`
                  : `From the file ${snap.fileName ?? ""} · uploaded ${utc(snap.takenAt)}${snap.takenByName ? ` by ${snap.takenByName}` : ""}`
                : "No copy yet. Pull one from QuickBooks Online or upload an exported file."}
            </p>
            <QbActions kind={kind} canPull={canPull} online={online} fileHint={meta.fileHint} />
            {snap && (
              <details className="mt-4 rounded-md border border-slate-200 dark:border-slate-800" data-testid={`qb-table-${kind}`}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  Show the {snap.rowCount.toLocaleString("en-US")} row{snap.rowCount === 1 ? "" : "s"}
                </summary>
                <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                        {snap.table.columns.map((c, i) => (
                          <th key={i} className="px-3 py-2 font-medium">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, ri) => (
                        <tr key={ri} className={`border-t border-slate-100 dark:border-slate-800 ${boldSet.has(ri) ? "font-semibold" : ""}`} data-testid={`qb-row-${kind}`}>
                          {snap.table.columns.map((_, ci) => (
                            <td key={ci} className={`whitespace-pre px-3 py-1.5 ${ci > 0 && looksLikeMoney(r[ci] ?? "") ? "text-right tabular-nums" : ""}`}>{r[ci] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {snap.table.rows.length > SHOW_ROWS && <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Showing the first {SHOW_ROWS} rows. The download has all of them.</p>}
              </details>
            )}
            {snap && (
              <p className="mt-3 text-sm">
                <a className="font-medium text-emerald-700 hover:underline dark:text-emerald-400" href={`/api/quickbooks/${kind.toLowerCase()}/csv`} data-testid={`qb-csv-${kind}`}>Download as a spreadsheet (CSV)</a>
              </p>
            )}
          </section>
        );
      })}

      <ConnectGuide guideKey="quickbooks-desktop" />
    </div>
  );
}
