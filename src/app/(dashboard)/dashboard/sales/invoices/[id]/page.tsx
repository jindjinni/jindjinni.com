import { DocDetailPage } from "../../doc-pages";

export const dynamic = "force-dynamic";

export default async function INVOICEDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocDetailPage kind="INVOICE" id={id} />;
}
