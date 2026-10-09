import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { supportTickets } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { listCompanies } from "@/lib/company-admin";
import { isFullLevel } from "@/lib/mothership-rules";
import { staffLevelOf } from "@/lib/platform-admin";
import { ticketLabel, whenText } from "@/lib/support-rules";
import { ticketsOfCompany } from "@/lib/support-service";
import { requireOrg } from "@/lib/tenant";
import { twoStepOn } from "@/lib/two-step";
import { StatusPill } from "@/components/support-thread";
import { ViewAsButton } from "../../support/support-admin-forms";
import { CompanyDetails } from "../company-details";

export const dynamic = "force-dynamic";

const BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  approved: { label: "Active", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  rejected: { label: "Turned down", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  suspended: { label: "Suspended", cls: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
  banned: { label: "Banned", cls: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
};

/** One company's page: who they are, how to reach them, their tickets, and (with their OK) a read-only look at their account. */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg({ real: true });
  const level = await staffLevelOf(org);
  if (!level) notFound();
  const { id } = await params;
  const { rows } = await listCompanies({ id });
  const c = rows[0];
  if (!c) notFound();

  const tickets = await ticketsOfCompany(c.id, 15);
  // The newest unsolved ticket on which the company currently allows a look.
  const nowIso = new Date().toISOString();
  const [open] = await db
    .select({ id: supportTickets.id, ticketNo: supportTickets.ticketNo, until: supportTickets.viewConsentUntil })
    .from(supportTickets)
    .where(and(eq(supportTickets.organizationId, c.id), ne(supportTickets.status, "solved"), gt(supportTickets.viewConsentUntil, nowIso)))
    .orderBy(desc(supportTickets.viewConsentUntil))
    .limit(1);
  const viewFeature = await featureOn("view-as-company", org.organizationId);
  const hasTwoStep = await twoStepOn(org.userId);
  const b = BADGE[c.status];
  const own = c.id === org.organizationId;

  return (
    <div className="flex max-w-4xl flex-col gap-5" data-testid="company-page">
      <div>
        <Link href="/dashboard/lamp/companies" className="text-sm text-slate-600 underline dark:text-slate-300">&larr; All companies</Link>
        <h2 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          <span className="min-w-0 break-words" data-testid="company-name">{c.name}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid="company-code">{c.code}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {c.ownerName ?? "Owner"}{c.ownerEmail ? <> · <a className="underline" href={`mailto:${c.ownerEmail}`} data-testid="reach-owner">{c.ownerEmail}</a></> : null}
          {c.contactPhone ? ` · ${c.contactPhone}` : ""}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="view-company-card">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Look at their account</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Read-only, 30 minutes, and only after the company says yes on a ticket. They are told, and they can read the log of every look in their Support page.</p>
        {own ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This is your own company.</p>
        ) : (
          <>
            <p className="mt-2 text-sm" data-testid="company-consent">
              {open ? <span className="text-emerald-700 dark:text-emerald-400">They allowed it until {whenText(open.until)} (on ticket {ticketLabel(open.ticketNo)}).</span> : <span className="text-slate-600 dark:text-slate-300">They haven&apos;t allowed it right now. When they send a ticket they can tick &ldquo;Let Support look at your account&rdquo;. You can email the owner above to ask.</span>}
            </p>
            {!viewFeature ? (
              <p className="mt-2 text-xs text-slate-500">Switched off. Turn it on in Settings &rarr; Feature rollout.</p>
            ) : !hasTwoStep ? (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300" data-testid="needs-twostep">Turn on two-step sign-in in <Link className="underline" href="/dashboard/settings/account">My account</Link> first. Looking at a company&apos;s account requires it.</p>
            ) : open ? (
              <div className="mt-3"><ViewAsButton ticketId={open.id} /></div>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Their tickets</h3>
        {tickets.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500" data-testid="company-no-tickets">No tickets yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-slate-100 text-sm dark:divide-slate-800" data-testid="company-tickets">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={`/dashboard/lamp/support/${t.id}`} className="min-w-0 flex-1 break-words underline">{ticketLabel(t.ticketNo)} {t.subject}</Link>
                <StatusPill status={t.status} />
                <span className="text-xs text-slate-500">{whenText(t.lastMessageAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Company details</h3>
        <div className="flex flex-col gap-3"><CompanyDetails c={c} ownOrgId={org.organizationId} full={isFullLevel(level)} /></div>
      </section>
    </div>
  );
}
