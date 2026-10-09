import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/tenant";
import { logout } from "@/app/actions/auth";
import { openWorkspace } from "@/app/actions/workspaces";
import { kindLabel } from "@/lib/operation-groups-rules";
import { workspacesOfUser } from "@/lib/operation-groups";
import { SIDE_INFO } from "@/lib/operations-rules";
import { ROLE_LABELS, isAdmin } from "@/lib/permissions";
import { AuthCard, AuthShell, authBtnSecondary } from "@/components/auth/auth-ui";

export const dynamic = "force-dynamic";

/**
 * Where a person who can open two operations of the same company lands after signing in: Wholesale, Distribution, or Overall status.
 * Everything inside an operation stays inside it. One operation opens straight away, so this screen never shows for those.
 */
export default async function ChoosePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const all = await workspacesOfUser(userId);
  const byRoot = new Map<string, typeof all>();
  for (const w of all) byRoot.set(w.rootId, [...(byRoot.get(w.rootId) ?? []), w]);
  const group = [...byRoot.values()].find((g) => g.length > 1);
  if (!group) redirect("/dashboard");
  const sorted = [...group].sort((a, b) => (a.kind === "wholesale" ? -1 : b.kind === "wholesale" ? 1 : 0));
  const seesOverall = sorted.every((w) => isAdmin(w.role));
  const card = "flex h-full w-full flex-col gap-2 rounded-2xl border border-line bg-white p-5 text-left transition hover:border-brand-deep hover:shadow-[0_0_0_3px_rgb(31,209,107,0.25)] focus-visible:outline focus-visible:outline-2";

  return (
    <AuthShell>
      <AuthCard className="max-w-3xl p-7 sm:p-10">
        <div data-testid="choose-workspace">
          <p className="inline-flex rounded-full border border-mint-line bg-mint px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-deep">{sorted[0].companyName}</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Which operation do you want to open?</h1>
          <p className="mt-2 text-base text-muted">Each operation is kept apart: its own customers, suppliers, products, orders, stock and payments.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {sorted.map((w) => (
              <form key={w.organizationId} action={openWorkspace} className="contents">
                <input type="hidden" name="organizationId" value={w.organizationId} />
                <button className={card} data-testid={`open-${w.kind ?? "workspace"}`}>
                  <span className="text-xl font-extrabold text-ink">{kindLabel(w.kind)}</span>
                  <span className="text-sm text-muted">{w.kind ? SIDE_INFO[w.kind].tagline : "Your company's operation."}</span>
                  <span className="mt-auto text-xs font-semibold text-brand-deep">You are: {ROLE_LABELS[w.role as keyof typeof ROLE_LABELS] ?? w.role}</span>
                </button>
              </form>
            ))}
          </div>
          {seesOverall && (
            <a href="/overview" className={`${authBtnSecondary} mt-4`} data-testid="open-overall">See the overall status of both</a>
          )}
          <form action={logout} className="mt-6">
            <button className="text-sm text-muted underline">Sign out</button>
          </form>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
