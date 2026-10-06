import { IntakeFormFor } from "./intake-loader";

export const dynamic = "force-dynamic";

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IntakeFormFor id={id} />;
}
