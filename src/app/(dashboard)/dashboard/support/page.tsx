import Link from "next/link";
import { notFound } from "next/navigation";
import { featureOn } from "@/lib/features";
import { ensureCompanyCode } from "@/lib/company-code";
import { isAdmin } from "@/lib/permissions";
import { listCompanyTickets, viewLogForCompany } from "@/lib/support-service";
import { ticketLabel, whenText } from "@/lib/support-rules";
import { requireOrg } from "@/lib/tenant";
import { StatusPill } from "@/components/support-thread";
import { NewTicketForm } from "./support-forms";

export const dynamic = "force-dynamic";

/** The company's own Support page: send a ticket, follow your tickets, and (owners/admins) see every time support looked at the account. */
export default async function SupportPage() {
  const org = await requireOrg();
  if (!(await featureOn("support-center", org.organizationId))) notFound();
  const admin = isAdmin(org.role);
  const [tickets, code, log] = await Promise.all([
    listCompanyTickets(org),
    ensureCompanyCode(org.organizationId),
    admin ? viewLogForCompany(org.organizationId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="support-page">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Support</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Stuck or have a question? Send us a ticket and we reply here and by email. Your company ID is{" "}
          <strong className="font-mono text-slate-800 dark:text-slate-100" data-testid="my-company-code">{code}</strong>
          {" "}and it is already attached to everything you send, so you never need to look it up.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-50">New ticket</h3>
        <NewTicketForm canAllowView={admin} />
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-50">{admin ? "Your company's tickets" : "Your tickets"}</h3>
        {tickets.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="no-tickets">No tickets yet.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="ticket-list">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/support/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900" data-testid="ticket-item">
                  <span className="font-mono text-xs text-slate-500">{ticketLabel(t.ticketNo)}</span>
                  <strong className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-50">{t.subject}</strong>
                  <StatusPill status={t.status} forCompany />
                  <span className="text-xs text-slate-500">{whenText(t.lastMessageAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="view-log">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Support access log</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every time Jindjinni Support looked at your account (only ever after you allowed it on a ticket, read-only, for up to 30 minutes).
          </p>
          {log.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" data-testid="view-log-empty">Support has never looked at your account.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 text-sm" data-testid="view-log-list">
              {log.map((l) => (
                <li key={l.id} className="rounded-md border border-slate-100 px-3 py-2 dark:border-slate-800" data-testid="view-log-item">
                  <span className="font-medium text-slate-900 dark:text-slate-50">{whenText(l.startedAt)}</span> &middot; {l.adminName ?? "Jindjinni Support"} &middot; for ticket {l.ticketNo ? ticketLabel(l.ticketNo) : ""}
                  {l.reason ? <span className="block text-xs text-slate-500">Reason: {l.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
