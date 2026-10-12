import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { blockSupportStaff } from "@/lib/staff-guard";
import { isAdmin } from "@/lib/permissions";
import { mailboxesOn } from "@/lib/mail-access";
import { OAUTH } from "@/lib/email-connector";
import { loadEmailPlan } from "@/lib/email-setup-service";
import { PLACEHOLDER_DOMAIN } from "@/lib/email-setup-rules";
import { EmailsForm } from "./emails-form";

export const dynamic = "force-dynamic";

export default async function CompanyEmailsPage() {
  const org = await requireOrg();
  await blockSupportStaff(org);
  if (!isAdmin(org.role)) redirect("/dashboard/settings");
  const [plan, mailOn] = await Promise.all([loadEmailPlan(org.organizationId), mailboxesOn(org.organizationId)]);
  const signIn = Object.values(OAUTH).some((p) => p.configured());
  const connected = plan.rows.filter((r) => r.status === "ACTIVE").length;
  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Company emails</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        Give each department its own email address. Customers and suppliers then see mail from your company, not from a shared sender, and replies come back to the right team.
        Use addresses on your company&rsquo;s own web address, like <strong>purchasing@{plan.domain ?? PLACEHOLDER_DOMAIN}</strong>, so people recognise who is writing.
      </p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="emails-progress">
        {connected} of {plan.rows.length} connected.
      </p>
      <ol className="mt-4 max-w-3xl list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
        <li>Type the address for each department below (or press the suggestion) and save.</li>
        <li>Press <strong>Connect</strong> on a department and sign in to that address. We never see your password.</li>
        <li>Press <strong>Check connection</strong> there. A test email arrives in that mailbox.</li>
      </ol>
      {!mailOn && (
        <p className="mt-4 max-w-3xl rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100" data-testid="emails-not-on">
          Saving your addresses now means they are ready. The Connect buttons appear as soon as department email is switched on for your company.
        </p>
      )}
      {mailOn && !signIn && (
        <p className="mt-4 max-w-3xl rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100" data-testid="emails-no-signin">
          Signing in with Google or Microsoft is being set up. Until it is ready, any address can still be connected with its email password (press Connect, then &ldquo;Another email host&rdquo;).
        </p>
      )}
      <EmailsForm rows={plan.rows} mailOn={mailOn} />
      <p className="mt-6 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
        Looking for the address that quotations and payment notices come from for the whole company? That is in{" "}
        <Link href="/dashboard/settings/connectors" className="font-medium text-emerald-700 underline dark:text-emerald-400">Settings → Connectors</Link>.
      </p>
    </div>
  );
}
