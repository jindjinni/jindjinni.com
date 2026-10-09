import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUserId } from "@/lib/tenant";
import { openWorkspace } from "@/app/actions/workspaces";
import { kindLabel } from "@/lib/operation-groups-rules";
import { workspacesOfUser } from "@/lib/operation-groups";
import { getCompanyPulse } from "@/lib/home-stats";
import { openWorkOf } from "@/lib/operations-service";
import { isAdmin } from "@/lib/permissions";
import { AuthCard, AuthShell, authBtnSecondary } from "@/components/auth/auth-ui";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Overall status: the two operations of one company side by side, read-only totals only. Records are never merged; clicking a side opens
 * that operation. Only owners and admins (people who can open both) see it, and only for operations where they hold that role.
 */
export default async function OverviewPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const all = await workspacesOfUser(userId);
  const byRoot = new Map<string, typeof all>();
  for (const w of all) byRoot.set(w.rootId, [...(byRoot.get(w.rootId) ?? []), w]);
  const group = [...byRoot.values()].find((g) => g.length > 1);
  if (!group || !group.every((w) => isAdmin(w.role))) redirect("/dashboard");
  const sorted = [...group].sort((a, b) => (a.kind === "wholesale" ? -1 : b.kind === "wholesale" ? 1 : 0));
  const data = await Promise.all(
    sorted.map(async (w) => {
      const [pulse, open] = await Promise.all([getCompanyPulse(w.organizationId), openWorkOf(w.organizationId)]);
      return { w, pulse, open };
    }),
  );
  const row = "flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm last:border-0";

  return (
    <AuthShell>
      <AuthCard className="max-w-4xl p-7 sm:p-10">
        <div data-testid="overall-status">
          <p className="inline-flex rounded-full border border-mint-line bg-mint px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-deep">{sorted[0].companyName}</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Overall status</h1>
          <p className="mt-2 text-base text-muted">The numbers of each operation next to each other. They are never added together or mixed. Open a side to work in it.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {data.map(({ w, pulse, open }) => (
              <section key={w.organizationId} className="flex flex-col rounded-2xl border border-line bg-white p-5" data-testid={`overall-${w.kind}`}>
                <h2 className="text-xl font-extrabold text-ink">{kindLabel(w.kind)}</h2>
                <dl className="mt-3">
                  <div className={row}><dt className="text-muted">Quotations given this month</dt><dd className="font-semibold text-ink" data-k="quotes">{pulse.periods.month.purchasing.quotesGiven}</dd></div>
                  <div className={row}><dt className="text-muted">Quotations waiting for the customer</dt><dd className="font-semibold text-ink" data-k="waiting">{pulse.now.purchasing.waitingForCustomer}</dd></div>
                  <div className={row}><dt className="text-muted">Open purchase orders</dt><dd className="font-semibold text-ink" data-k="pos">{open.openPurchaseOrders}</dd></div>
                  <div className={row}><dt className="text-muted">Packages waiting to be opened</dt><dd className="font-semibold text-ink" data-k="receiving">{pulse.now.receiving.waitingToOpen}</dd></div>
                  <div className={row}><dt className="text-muted">Orders to pay</dt><dd className="font-semibold text-ink" data-k="topay">{pulse.now.accounts.toPay} · {usd(pulse.now.accounts.toPayValue)}</dd></div>
                  <div className={row}><dt className="text-muted">Overdue</dt><dd className={pulse.now.accounts.overdue ? "font-semibold text-red-700" : "font-semibold text-ink"} data-k="overdue">{pulse.now.accounts.overdue} · {usd(pulse.now.accounts.overdueValue)}</dd></div>
                </dl>
                <form action={openWorkspace} className="mt-4">
                  <input type="hidden" name="organizationId" value={w.organizationId} />
                  <button className={authBtnSecondary} data-testid={`overall-open-${w.kind}`}>Open {kindLabel(w.kind)}</button>
                </form>
              </section>
            ))}
          </div>
          <p className="mt-6 text-sm"><Link href="/choose" className="underline">Back</Link></p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
