// The payment email, sent by itself the moment Accounts marks an order Paid (feature `auto-payment-email`).
// It is exactly the email Customer Service sends by hand (same wording, same notes Receiving wrote, same attachments), through the same
// checks. If anything is missing it sends nothing and the order waits in Customer Service -> To Be Emailed, with the reason.
// It never makes marking an order Paid fail: whatever happens here, the order stays Paid.

import { featureOn } from "@/lib/features";
import { getReceivingSettings } from "@/lib/receiving-queries";
import { getEmailDraft } from "@/lib/customer-service-queries";
import { autoSendDecision } from "@/lib/customer-service-rules";
import { auditReceiving, deliverCustomerEmail, type OrgRef } from "@/lib/receiving-service";
import { db } from "@/db/client";
import { receivingPackages } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type AutoSendResult = { status: "sent" | "held" | "off"; message: string };

export async function autoSendPaymentEmail(org: OrgRef, packageId: string): Promise<AutoSendResult> {
  try {
    const on = await featureOn("auto-payment-email", org.organizationId);
    if (!on) return { status: "off", message: "" };
    const settings = await getReceivingSettings(org.organizationId);
    const draft = await getEmailDraft(org, packageId);
    if (!draft) return { status: "off", message: "" };
    const decision = autoSendDecision({
      featureOn: on,
      settingOn: settings.autoSendPaymentEmail,
      alreadyEmailed: draft.alreadyEmailed,
      readiness: { blockers: draft.blockers, ready: draft.ready },
    });
    const [pkg] = await db
      .select({ quotationId: receivingPackages.quotationId })
      .from(receivingPackages)
      .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
      .limit(1);
    if (decision.action === "hold") {
      if (!decision.quiet && pkg) await auditReceiving(org, pkg.quotationId, "customer-service", `Payment email not sent automatically: ${draft.blockers.join(" ")}`);
      return { status: decision.quiet ? "off" : "held", message: decision.message };
    }
    // The same send an agent would press: it claims the order first, so a second send can't happen.
    const sent = await deliverCustomerEmail(org, packageId, "STATUS", undefined, "first");
    if (!sent.ok) {
      if (pkg) await auditReceiving(org, pkg.quotationId, "customer-service", `Payment email not sent automatically: ${sent.error}`);
      return { status: "held", message: `Marked Paid. The customer email was not sent automatically: ${sent.error} It is waiting in Customer Service, To Be Emailed.` };
    }
    if (pkg) await auditReceiving(org, pkg.quotationId, "customer-service", `Payment email sent automatically when the order was marked Paid (${sent.template})`);
    // Adjusted AND bad packaging (feature `separate-packaging-email`): the packaging warning goes as its own second email.
    if (sent.template === "ADJUSTMENT_SEPARATE" && !draft.packagingWarningSentAt) {
      const warned = await deliverCustomerEmail(org, packageId, "WARNING");
      if (!warned.ok) {
        if (pkg) await auditReceiving(org, pkg.quotationId, "customer-service", `Packaging warning not sent automatically: ${warned.error}`);
        return { status: "sent", message: `Marked Paid. The customer was emailed automatically. The separate packaging warning was not sent: ${warned.error} Send it from the order in Customer Service.` };
      }
      if (pkg) await auditReceiving(org, pkg.quotationId, "customer-service", "Packaging warning sent automatically as a separate email when the order was marked Paid");
      return { status: "sent", message: "Marked Paid. The customer was emailed automatically: the adjustment email and the packaging warning, as two separate emails." };
    }
    return { status: "sent", message: "Marked Paid. The customer was emailed automatically." };
  } catch (e) {
    console.error("[auto-payment-email]", e);
    return { status: "held", message: "Marked Paid. The automatic customer email hit a problem, so nothing was sent. Customer Service can send it from To Be Emailed." };
  }
}
