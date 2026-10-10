import { MailboxSettings, type SettingsSearch } from "@/components/mail/mailbox-settings";

export const dynamic = "force-dynamic";

export default async function MailSettingsPage({ searchParams }: { searchParams: Promise<SettingsSearch> }) {
  return <MailboxSettings dept="purchasing" sp={await searchParams} />;
}
