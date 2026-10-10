import { OutboxPage } from "@/components/mail/item-pages";

export const dynamic = "force-dynamic";

export default async function MailOutboxRoute({ params }: { params: Promise<{ id: string }> }) {
  return <OutboxPage dept="customer-service" id={(await params).id} />;
}
