import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteAccounts, canWritePayment, canWriteReceiving, isAdmin } from "@/lib/permissions";
import { getReceivingCatalog, getReceivingPackage } from "@/lib/receiving-queries";
import { getAdjustmentForPackage } from "@/lib/receiving-adjustment-service";
import { storage } from "@/lib/receiving-storage";
import { listChecks, listRecalls } from "@/lib/receiving-recall-service";
import { listSerials } from "@/lib/receiving-serial-service";
import { photoReadingOn } from "@/lib/receiving-recall-photo";
import { IntakeForm, type FormValues } from "./intake-form";

/**
 * Loads one receiving record and draws the complete Receiving Intake Form for it. Receiving shows it as it always was.
 * The Accounts department shows the same form with `focus="accounts"`: read-only, with Step 10 highlighted and payable.
 */
export async function IntakeFormFor({ id, focus }: { id: string; focus?: "accounts" }) {
  const org = await requireOrg();
  const data = await getReceivingPackage(org.organizationId, id);
  if (!data) notFound();
  const { pkg } = data;
  const catalog = await getReceivingCatalog(org.organizationId);
  const adjustmentView = await getAdjustmentForPackage(org.organizationId, id);
  const [recalls, recallChecks, serials] = await Promise.all([listRecalls(org.organizationId), listChecks(org.organizationId, id), listSerials(org.organizationId, id)]);

  const initial: FormValues = {
    trackingNumber: pkg.trackingNumber ?? "",
    carrier: pkg.carrier ?? "",
    receivedAt: pkg.receivedAt ? pkg.receivedAt.slice(0, 16).replace(" ", "T") : "",
    receivedByUserId: pkg.receivedByUserId ?? "",
    externalDamage: pkg.externalDamage ?? "",
    damageTypes: data.damageTypes,
    damageNotes: pkg.damageNotes ?? "",
    doubleBoxed: pkg.doubleBoxed ?? "",
    protectiveMaterial: pkg.protectiveMaterial ?? "",
    sturdyOuterBox: pkg.sturdyOuterBox ?? "",
    productsSecured: pkg.productsSecured ?? "",
    packageSealed: pkg.packageSealed ?? "",
    packagingRequirementsMet: pkg.packagingRequirementsMet ?? "",
    overallPackaging: pkg.overallPackaging ?? "",
    packagingIssueNotes: pkg.packagingIssueNotes ?? "",
    packingSheetIncluded: pkg.packingSheetIncluded ?? "",
    quantityMatches: pkg.quantityMatches ?? "",
    adjustmentNeeded: pkg.adjustmentNeeded ?? "",
    adjustmentDetails: pkg.adjustmentDetails ?? "",
    receivingNotes: pkg.receivingNotes ?? "",
    adjustedOrderTotal: pkg.adjustedOrderTotal != null ? String(pkg.adjustedOrderTotal) : "",
    adjustmentAmountEmail: pkg.adjustmentAmountEmail != null ? String(pkg.adjustmentAmountEmail) : "",
    customerEmailNote: pkg.customerEmailNote ?? "",
    accountsDecision: pkg.accountsDecision ?? "",
    accountsStatus: pkg.accountsStatus ?? "",
    customerTexted: !!pkg.customerTexted,
  };

  return (
    <IntakeForm
      key={focus ? `${pkg.id}:${pkg.status}:${pkg.accountsStatus ?? ""}:${focus}` : `${pkg.id}:${pkg.status}`}
      packageId={pkg.id}
      status={pkg.status}
      focus={focus}
      canWrite={focus === "accounts" ? false : canWriteReceiving(org.role, org.access)}
      canAccounts={focus === "accounts" ? false : canWriteAccounts(org.role, org.access)}
      canPayment={canWritePayment(org.role, org.access)}
      isAdminUser={focus === "accounts" ? false : isAdmin(org.role)}
      storageOk={storage.configured()}
      brief={data.brief}
      receipt={{ present: !!data.receipt.receipt, isImage: data.receipt.isImage }}
      tracking={data.tracking}
      team={data.team}
      duplicates={data.duplicates}
      settings={{ emailsEnabled: data.settings.emailsEnabled }}
      photos={data.photos}
      items={data.items}
      quotedLines={data.quotedLines}
      adjustment={data.adjustment}
      adjustmentView={adjustmentView}
      recalls={recalls}
      recallChecks={recallChecks}
      serials={serials}
      photoReading={photoReadingOn()}
      started={data.started}
      catalog={catalog}
      saved={{
        accountsStatus: pkg.accountsStatus ?? "",
        paidAt: pkg.paidAt,
        submittedAt: pkg.submittedAt,
        submittedByUserId: pkg.submittedByUserId,
        createdAt: pkg.createdAt,
        customerNotifiedAt: pkg.customerNotifiedAt,
        packagingWarningSentAt: pkg.packagingWarningSentAt,
      }}
      initial={initial}
    />
  );
}
