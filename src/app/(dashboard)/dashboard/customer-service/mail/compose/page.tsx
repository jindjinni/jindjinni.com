import { ComposePage, type ComposeSearch } from "@/components/mail/compose-page";

export const dynamic = "force-dynamic";

export default async function MailComposePage({ searchParams }: { searchParams: Promise<ComposeSearch> }) {
  return <ComposePage dept="customer-service" sp={await searchParams} />;
}
