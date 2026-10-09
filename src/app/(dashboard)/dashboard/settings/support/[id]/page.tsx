import { redirect } from "next/navigation";

export default async function OldTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/lamp/support/${encodeURIComponent(id)}`);
}
