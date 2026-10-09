import Link from "next/link";
import { notFound } from "next/navigation";
import { featureOn } from "@/lib/features";
import { isAdmin } from "@/lib/permissions";
import { getCompanyTicket } from "@/lib/support-service";
import { consentActiveNow, ticketLabel, whenText } from "@/lib/support-rules";
import { requireOrg } from "@/lib/tenant";
import { StatusPill, Thread } from "@/components/support-thread";
import { AllowViewForm, ReplyForm, TakeBackForm } from "../support-forms";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  if (!(await featureOn("support-center", org.organizationId))) notFound();
  const { id } = await params;
  const found = await getCompanyTicket(org, id);
  if (!found) notFound();
  const { ticket, messages } = found;
  const admin = isAdmin(org.role);
  const allowed = consentActiveNow(ticket.viewConsentUntil);

  return (
    <div className="flex max-w-3xl flex-col gap-5" data-testid="ticket-page">
      <div>
        <Link href="/dashboard/support" className="text-sm text-slate-600 underline dark:text-slate-300">&larr; All tickets</Link>
        <h2 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          <span className="font-mono text-base text-slate-500">{ticketLabel(ticket.ticketNo)}</span>
          <span className="min-w-0 break-words" data-testid="ticket-subject">{ticket.subject}</span>
          <StatusPill status={ticket.status} forCompany />
        </h2>
        <p className="mt-1 text-xs text-slate-500">Sent {whenText(ticket.createdAt)}{ticket.category ? ` · ${ticket.category}` : ""}</p>
      </div>

      <Thread messages={messages} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <ReplyForm ticketId={ticket.id} />
      </section>

      {admin && ticket.status !== "solved" && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="consent-box">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Let Support look at your account</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sometimes the fastest fix is for us to see what you see. If you allow it, Support can open your account <strong>read-only</strong> (nothing can be changed or downloaded), for up to 30 minutes at a time, until your permission runs out. Each look appears in your Support access log, and you can take your permission back here at any time.
          </p>
          {allowed ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-emerald-800 dark:text-emerald-300" data-testid="consent-active">Allowed until {whenText(ticket.viewConsentUntil)}.</p>
              <TakeBackForm ticketId={ticket.id} />
            </div>
          ) : (
            <div className="mt-3"><AllowViewForm ticketId={ticket.id} /></div>
          )}
        </section>
      )}
    </div>
  );
}
