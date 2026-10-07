import { lookupUnsubscribe } from "@/lib/marketing-service";
import { AuthCard, AuthShell } from "@/components/auth/auth-ui";
import { UnsubscribeButton } from "./unsubscribe-button";

export const dynamic = "force-dynamic";

// Opened from the link at the bottom of a marketing email. No account needed.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupUnsubscribe(token);
  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        {!found ? (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="unsub-title">This link isn&apos;t valid</h1>
            <p className="mt-3 text-base text-muted">Check that you opened the whole link from the email. If it still doesn&apos;t work, reply to the email and ask to be removed.</p>
          </>
        ) : (
          <UnsubscribeButton token={token} company={found.organizationName} address={found.address} channel={found.channel} already={found.already} />
        )}
      </AuthCard>
    </AuthShell>
  );
}
