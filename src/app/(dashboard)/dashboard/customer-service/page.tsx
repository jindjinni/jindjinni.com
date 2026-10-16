import { requireOrg } from "@/lib/tenant";
import { getReceivingSettings, getToBeEmailed } from "@/lib/customer-service-queries";
import Link from "next/link";
import { isAdmin } from "@/lib/permissions";
import { CsList } from "./cs-list";
import { featureOn } from "@/lib/features";

export const dynamic = "force-dynamic";

// To Be Emailed: every order Accounts has paid whose customer hasn't been told yet. Nothing is sent by itself.
export default async function ToBeEmailedPage() {
  const org = await requireOrg();
  const orders = await getToBeEmailed(org.organizationId);
  // A company that has not finished Email Settings can't send anything: say so here, before anyone opens an order.
  const settings = await getReceivingSettings(org.organizationId);
  const setupProblem = !settings.emailsEnabled ? "Customer emails are turned off." : !settings.quoteLinkUrl.trim() ? "Your website link isn't set." : null;
  // Feature `auto-payment-email`: the email goes out by itself when Accounts marks an order Paid, so this list only holds the ones that could not.
  const autoOn = settings.autoSendPaymentEmail && !setupProblem && (await featureOn("auto-payment-email", org.organizationId));
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">To Be Emailed</h1>
      <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-400">
        {autoOn
          ? "Orders Accounts has paid whose email has not gone out. Payment emails are sent automatically the moment Accounts marks an order Paid, so an order here is waiting because something is missing (each one says what). Open it, fix that, then press Send."
          : "Orders Accounts has paid. Open one to check the email and its payment receipt, then press Send. The customer is only ever told by email."}
      </p>
      {setupProblem && (
        <p role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="cs-setup-note">
          {setupProblem} No email can be sent until that is fixed.{" "}
          {isAdmin(org.role) ? (
            <Link href="/dashboard/customer-service/email-settings" className="font-medium underline">Open Email Settings</Link>
          ) : (
            "Ask an Admin to finish Email Settings (Customer Service -> Email Settings)."
          )}
        </p>
      )}
      <CsList mode="waiting" orders={orders} />
    </div>
  );
}
