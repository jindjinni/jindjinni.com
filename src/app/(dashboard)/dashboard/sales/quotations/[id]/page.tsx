import { DocDetailPage } from "../../doc-pages";

export const dynamic = "force-dynamic";

export default async function QUOTATIONDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocDetailPage kind="QUOTATION" id={id} />;
}
