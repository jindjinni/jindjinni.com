import { CampaignPage } from "../../campaign-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignPage channel="TEXT" id={id} />;
}
