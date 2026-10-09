import Link from "next/link";
import { notFound } from "next/navigation";
import { TONE_CLASS, accountStatusText, paymentStatusText } from "@/lib/account-status";
import { featureOn } from "@/lib/features";
import { isPlatformStaff } from "@/lib/platform-admin";
import { consentActiveNow, ticketLabel, whenText } from "@/lib/support-rules";
import { getTicketForPlatform } from "@/lib/support-service";
import { requireOrg } from "@/lib/tenant";
import { twoStepOn } from "@/lib/two-step";
import { StatusPill, Thread } from "@/components/support-thread";
import { NoteForm, ReplyAsSupportForm, StatusForm, ViewAsButton } from "../support-admin-forms";

export const dynamic = "force-dynamic";

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformStaff(org))) notFound();
  const { id } = await params;
  const data = await getTicketForPlatform(id);
  if (!data) notFound();
  const { ticket, messages, summary, previous } = data;
  const allowed = consentActiveNow(ticket.viewConsentUntil);
  const viewFeature = await featureOn("view-as-company", org.organizationId);
  const hasTwoStep = await twoStepOn(org.userId);

  const dl = "grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm";
  const dt = "text-slate-500 dark:text-slate-400";
  const acct = summary ? accountStatusText(summary.approvalStatus) : null;
  const pay = summary ? paymentStatusText(summary) : null;

  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="support-ticket">
      <div>
        <Link href="/dashboard/lamp/support" className="text-sm text-slate-600 underline dark:text-slate-300">&larr; All tickets</Link>
        <h2 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          <span className="font-mono text-base text-slate-500">{ticketLabel(ticket.ticketNo)}</span>
          <span className="min-w-0 break-words" data-testid="ticket-subject">{ticket.subject}</span>
          <StatusPill status={ticket.status} />
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          From {ticket.fromName || ticket.fromEmail}{ticket.fromEmail && ticket.fromName ? ` <${ticket.fromEmail}>` : ""} · {ticket.source === "email" ? "by email" : "from the app"} · started {whenText(ticket.createdAt)}{ticket.category ? ` · ${ticket.category}` : ""}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Thread messages={messages} />
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><ReplyAsSupportForm ticketId={ticket.id} /></section>
          <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20"><NoteForm ticketId={ticket.id} /></section>
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><StatusForm ticketId={ticket.id} status={ticket.status} priority={ticket.priority} /></section>
        </div>

        <aside className="flex flex-col gap-4" data-testid="company-card">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Company</h3>
            {summary ? (
              <>
                <p className="mt-2 break-words text-base font-semibold text-slate-900 dark:text-slate-50" data-testid="card-name">{summary.name}</p>
                <p className="mt-0.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800" data-testid="card-code">{summary.code}</span></p>
                <dl className={`${dl} mt-3`}>
                  <dt className={dt}>Account</dt>
                  <dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[acct!.tone]}`} data-testid="card-account">{acct!.label}</span>{summary.approvalReason && summary.approvalStatus !== null && summary.approvalStatus !== "approved" ? <span className="mt-1 block text-xs text-slate-500">Reason: {summary.approvalReason}</span> : null}</dd>
                  <dt className={dt}>Payment</dt>
                  <dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[pay!.tone]}`} data-testid="card-payment">{pay!.label}</span><span className="mt-1 block text-xs text-slate-500">{pay!.text}</span></dd>
                  <dt className={dt}>Plan</dt>
                  <dd data-testid="card-plan">{summary.billingPlan === "yearly" ? "Yearly" : summary.billingPlan === "monthly" ? "Monthly" : "Not chosen"}{summary.serviceEndsOn ? ` · cancelled, ends ${summary.serviceEndsOn}` : ""}</dd>
                  <dt className={dt}>Trial</dt>
                  <dd>{summary.trialStartsOn ? `${summary.trialStartsOn} to day before ${summary.firstBillableOn}` : "Not started"}</dd>
                  <dt className={dt}>Owner</dt>
                  <dd className="break-words" data-testid="card-owner">{summary.ownerName ?? "—"}<br /><a className="underline" href={`mailto:${summary.ownerEmail}`}>{summary.ownerEmail}</a></dd>
                  {(summary.contactName || summary.contactEmail) && (<><dt className={dt}>Contact</dt><dd className="break-words">{summary.contactName}<br />{summary.contactEmail}{summary.contactPhone ? <><br />{summary.contactPhone}</> : null}</dd></>)}
                  {summary.businessPhone && (<><dt className={dt}>Phone</dt><dd>{summary.businessPhone}</dd></>)}
                  <dt className={dt}>People</dt>
                  <dd>{summary.teamSize}</dd>
                  <dt className={dt}>Joined</dt>
                  <dd>{whenText(summary.createdAt)}</dd>
                </dl>
                <p className="mt-3 text-sm"><Link className="underline" href={`/dashboard/lamp/companies/${summary.id}`} data-testid="card-companies-link">Open company page</Link></p>
              </>
            ) : (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300" data-testid="card-unknown">This email came from an address we don&apos;t recognise, so no company is attached. Reply to the sender, or ask who they are.</p>
            )}
          </section>

          {summary && (
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="view-as-card">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">View as company</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Read-only, 30 minutes, only with the company&apos;s OK on this ticket. The company is told and can see it in its Support access log.</p>
              <p className="mt-2 text-sm" data-testid="consent-state">
                {allowed ? <span className="text-emerald-700 dark:text-emerald-400">The company allowed it until {whenText(ticket.viewConsentUntil)}.</span> : <span className="text-slate-600 dark:text-slate-300">The company has not allowed it. Ask them to tick &ldquo;Let Support look at your account&rdquo; on the ticket.</span>}
              </p>
              {!viewFeature ? (
                <p className="mt-2 text-xs text-slate-500">Switched off. Turn it on in Feature rollout.</p>
              ) : !hasTwoStep ? (
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-300" data-testid="needs-twostep">Turn on two-step sign-in in <Link className="underline" href="/dashboard/settings/account">My account</Link> first. Looking at a company&apos;s account requires it.</p>
              ) : allowed && ticket.status !== "solved" ? (
                <div className="mt-3"><ViewAsButton ticketId={ticket.id} /></div>
              ) : null}
            </section>
          )}

          {previous.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Their other tickets</h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {previous.map((p) => (
                  <li key={p.id}><Link className="underline" href={`/dashboard/lamp/support/${p.id}`}>{ticketLabel(p.ticketNo)} {p.subject}</Link> <span className="text-xs text-slate-500">({p.status})</span></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
