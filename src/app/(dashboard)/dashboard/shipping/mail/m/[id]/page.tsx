import { MessagePage } from "@/components/mail/item-pages";

export const dynamic = "force-dynamic";

export default async function MailMessageRoute({ params }: { params: Promise<{ id: string }> }) {
  return <MessagePage dept="shipping" id={(await params).id} />;
}
