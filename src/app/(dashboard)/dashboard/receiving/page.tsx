import { requireOrg } from "@/lib/tenant";
import { getReceivingBoard } from "@/lib/receiving-queries";
import { BoardView } from "./board-view";

export const dynamic = "force-dynamic";

export default async function AllShipmentsPage() {
  const org = await requireOrg();
  const cards = await getReceivingBoard(org.organizationId);
  return <BoardView cards={cards} />;
}
