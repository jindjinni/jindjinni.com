import { TemplatesPage } from "../../templates-page";

export const dynamic = "force-dynamic";

export default async function SalesTemplatesRoute({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  return <TemplatesPage department="sales" type={sp.type} />;
}
