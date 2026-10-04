import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lookupInvitation } from "@/lib/invitations";
import { ROLE_LABELS } from "@/lib/permissions";
import { AuthCard, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { AcceptForm } from "./accept-form";

const problems: Record<string, { title: string; body: string }> = {
  invalid: { title: "This link isn't valid", body: "Check that you copied the whole link from your invitation, or ask your admin to send a new one." },
  used: { title: "Invitation already used", body: "This invitation was already accepted. Sign in to get to your workspace." },
  revoked: { title: "Invitation cancelled", body: "Your admin cancelled this invitation. Ask them to send you a new one." },
  expired: { title: "Invitation expired", body: "This invitation is older than 7 days. Ask your admin to send you a new link." },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupInvitation(token);

  if (found.status !== "valid") {
    const p = problems[found.status];
    return (
      <AuthShell>
        <AuthCard className="max-w-xl p-7 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{p.title}</h1>
          <p className="mt-3 text-base text-muted">{p.body}</p>
          <Link href="/login" className={`${authBtnPrimary} mt-8 inline-flex`}>
            Go to sign in
          </Link>
        </AuthCard>
      </AuthShell>
    );
  }

  const { invitation, organizationName } = found;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1);
  const session = await auth();
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const signedInAsInvitee = !!existing && sessionUserId === existing.id;
  const mode = !existing ? "create" : signedInAsInvitee ? "join" : "signin";

  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Join {organizationName}</h1>
        <p className="mt-3 text-base text-muted">
          You&rsquo;ve been invited as <strong className="text-ink">{ROLE_LABELS[invitation.role]}</strong> using{" "}
          <strong className="text-ink">{invitation.email}</strong>.
        </p>
        {mode === "signin" ? (
          <>
            <p className="mt-4 text-base text-muted">
              You already have an account with this email. Sign in, and you&rsquo;ll come straight back here to join.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
              className={`${authBtnPrimary} mt-8 inline-flex`}
            >
              Sign in to join
            </Link>
          </>
        ) : (
          <AcceptForm token={token} mode={mode} />
        )}
      </AuthCard>
    </AuthShell>
  );
}
