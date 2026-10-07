import { requireOrg } from "@/lib/tenant";
import { canWriteReceiving } from "@/lib/permissions";
import { getReceivingBoard } from "@/lib/receiving-queries";
import { IntakeShell } from "./intake-shell";

export const dynamic = "force-dynamic";

// On the list page: shipments on the left. Inside a shipment: the form uses the full width (see IntakeShell).
export default async function IntakeLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const cards = await getReceivingBoard(org.organizationId);
  return (
    <IntakeShell cards={cards} canWrite={canWriteReceiving(org.role, org.access)}>
      {children}
    </IntakeShell>
  );
}
