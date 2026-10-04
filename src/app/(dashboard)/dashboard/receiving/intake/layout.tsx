import { requireOrg } from "@/lib/tenant";
import { canWriteReceiving } from "@/lib/permissions";
import { getReceivingBoard } from "@/lib/receiving-queries";
import { IntakeList } from "./intake-list";

export const dynamic = "force-dynamic";

// Master-detail: the list of shipments on the left, the selected shipment's form on the right.
export default async function IntakeLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const cards = await getReceivingBoard(org.organizationId);
  return (
    <div className="flex flex-col lg:flex-row">
      <div className="w-full shrink-0 border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-[calc(100vh-3.4rem)] lg:w-[22rem] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-900">
        <IntakeList cards={cards} canWrite={canWriteReceiving(org.role)} />
      </div>
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}
