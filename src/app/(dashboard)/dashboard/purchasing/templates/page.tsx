import { TemplatesPage } from "../../templates-page";

export const dynamic = "force-dynamic";

export default async function PurchasingTemplatesRoute({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  return <TemplatesPage department="purchasing" type={sp.type} />;
}
