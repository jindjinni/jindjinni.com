import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteReceiving } from "@/lib/permissions";
import { getReceivingPackage } from "@/lib/receiving-queries";
import { storage } from "@/lib/receiving-storage";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  const { id } = await params;
  const data = await getReceivingPackage(org.organizationId, id);
  if (!data) notFound();
  const { pkg } = data;

  return (
    <IntakeForm
      key={`${pkg.id}:${pkg.status}`}
      packageId={pkg.id}
      status={pkg.status}
      canWrite={canWriteReceiving(org.role)}
      storageOk={storage.configured()}
      brief={data.brief}
      receipt={{ present: !!data.receipt.receipt, isImage: data.receipt.isImage }}
      receivedByName={data.receivedByName}
      submittedAt={pkg.submittedAt}
      photos={data.photos}
      initial={{
        trackingNumber: pkg.trackingNumber ?? "",
        carrier: pkg.carrier ?? "",
        receivedAt: pkg.receivedAt ? pkg.receivedAt.slice(0, 16).replace(" ", "T") : "",
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
      }}
    />
  );
}
