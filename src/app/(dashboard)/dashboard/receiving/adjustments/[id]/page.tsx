import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWriteAccounts } from "@/lib/permissions";
import { getAdjustmentById } from "@/lib/receiving-adjustment-service";
import { AdjustmentEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function AdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  const { id } = await params;
  const adj = await getAdjustmentById(org.organizationId, id);
  if (!adj) notFound();
  return <AdjustmentEditor key={`${adj.id}:${adj.status}:${adj.adjustedTotal}`} adjustment={adj} canWrite={canWriteAccounts(org.role)} />;
}
