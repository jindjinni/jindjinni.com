import { DocNewPage } from "../../doc-pages";

export const dynamic = "force-dynamic";

export default async function NewQUOTATIONPage({ searchParams }: { searchParams: Promise<{ buyer?: string }> }) {
  const sp = await searchParams;
  return <DocNewPage kind="QUOTATION" buyerId={sp.buyer} />;
}
