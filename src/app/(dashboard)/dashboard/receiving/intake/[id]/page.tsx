import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteAccounts, canWriteReceiving, isAdmin } from "@/lib/permissions";
import { getReceivingPackage } from "@/lib/receiving-queries";
import { storage } from "@/lib/receiving-storage";
import { IntakeForm, type FormValues } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  const { id } = await params;
  const data = await getReceivingPackage(org.organizationId, id);
  if (!data) notFound();
  const { pkg } = data;

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
      key={`${pkg.id}:${pkg.status}:${data.adjustment?.status ?? ""}:${data.adjustment?.adjustedTotal ?? ""}`}
      packageId={pkg.id}
      status={pkg.status}
      canWrite={canWriteReceiving(org.role)}
      canAccounts={canWriteAccounts(org.role)}
      isAdminUser={isAdmin(org.role)}
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
