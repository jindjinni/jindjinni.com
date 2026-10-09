import { DocDetailPage } from "../../doc-pages";

export const dynamic = "force-dynamic";

export default async function QUOTATIONDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revise?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <DocDetailPage kind="QUOTATION" id={id} revise={sp.revise === "1"} />;
}
