import Link from "next/link";
import { CONNECTORS, STATE_LABEL, needsAction, type ConnectorKey, type ConnectorStatus } from "@/lib/connectors";

const PILL: Record<ConnectorStatus["state"], string> = {
  connected: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  test: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  platform: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  attention: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  not_connected: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  coming_soon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

/** One connector at a glance: its name, what it does, whether it works, and where to plug it in. */
export function ConnectorSummaryCard({ status, canManage, here }: { status: ConnectorStatus; canManage: boolean; here?: boolean }) {
  const info = CONNECTORS[status.key];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid={`connector-${status.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{info.title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[status.state]}`} data-testid={`connector-${status.key}-state`}>
          {STATE_LABEL[status.state]}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{info.what}</p>
      <p className={`mt-2 text-sm ${needsAction(status.state) ? "text-amber-800 dark:text-amber-300" : "text-slate-700 dark:text-slate-300"}`}>{status.detail}</p>
      {!here && status.state !== "coming_soon" && (
        <p className="mt-3 text-sm">
          {canManage ? (
            <Link href={info.manageHref} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400" data-testid={`connector-${status.key}-manage`}>
              {needsAction(status.state) ? "Connect it" : "Manage"} in {info.manageWhere} →
            </Link>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">An owner or admin manages this in {info.manageWhere}.</span>
          )}
        </p>
      )}
    </section>
  );
}

export function connectorKeysLabel(keys: ConnectorKey[]) {
  return keys.map((k) => CONNECTORS[k].title).join(", ");
}
