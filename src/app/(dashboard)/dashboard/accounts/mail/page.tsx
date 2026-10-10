import { MailHome, type MailSearch } from "@/components/mail/mail-home";

export const dynamic = "force-dynamic";

export default async function MailPage({ searchParams }: { searchParams: Promise<MailSearch> }) {
  return <MailHome dept="accounts" sp={await searchParams} />;
}
