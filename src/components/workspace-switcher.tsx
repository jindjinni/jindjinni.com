import Link from "next/link";
import { openWorkspace } from "@/app/actions/workspaces";
import { kindLabel, type Workspace } from "@/lib/operation-groups-rules";

/**
 * The little menu in the top bar for a company that runs two operations: shows which one is open and switches to the other (or to
 * Overall status). Hidden when the company has only one operation.
 */
export function WorkspaceSwitcher({ currentId, siblings, canSeeOverall }: { currentId: string; siblings: Workspace[]; canSeeOverall: boolean }) {
  if (siblings.length < 2) return null;
  const current = siblings.find((w) => w.organizationId === currentId);
  return (
    <details className="relative" data-testid="workspace-switcher">
      <summary className="cursor-pointer list-none rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" data-testid="workspace-current">
        {kindLabel(current?.kind)} ▾
      </summary>
      <div className="absolute left-0 z-40 mt-2 flex min-w-48 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {siblings.map((w) => (
          <form key={w.organizationId} action={openWorkspace}>
            <input type="hidden" name="organizationId" value={w.organizationId} />
            <button
              className={`w-full rounded-md px-3 py-1.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950 ${w.organizationId === currentId ? "font-semibold text-emerald-800 dark:text-emerald-300" : "text-slate-800 dark:text-slate-100"}`}
              data-testid={`switch-${w.kind}`}
              aria-current={w.organizationId === currentId ? "true" : undefined}
            >
              {kindLabel(w.kind)}
            </button>
          </form>
        ))}
        {canSeeOverall && (
          <Link href="/overview" className="rounded-md px-3 py-1.5 text-slate-800 hover:bg-emerald-50 dark:text-slate-100 dark:hover:bg-emerald-950" data-testid="switch-overall">
            Overall status
          </Link>
        )}
      </div>
    </details>
  );
}
