import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { getHeldCompanyForUser, getSessionUserId } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { AuthCard, AuthShell, authBtnSecondary } from "@/components/auth/auth-ui";
import { ResubmitForm } from "./resubmit-form";

export const dynamic = "force-dynamic";

function day(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Where a new (or suspended) company lands until the platform owner approves it. */
export default async function UnderReviewPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const held = await getHeldCompanyForUser(userId);
  if (!held) redirect("/dashboard");
  const owner = isOwner(held.role);

  return (
    <AuthShell>
      <AuthCard className="max-w-3xl p-7 sm:p-10">
        {held.status === "pending" ? (
          <div data-testid="under-review-pending">
            <p className="inline-flex rounded-full border border-mint-line bg-mint px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-deep">
              Under review
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Thanks. We&rsquo;re reviewing {held.organizationName}.</h1>
            <p className="mt-3 text-base text-muted">
              We only work with real, registered businesses, so a person checks every new company before it is switched on.
              We&rsquo;re comparing your EIN, state registration and proof document with what you entered. Your account was
              created on {day(held.createdAt)}. Nothing else is needed from you right now, and you can close this page. When
              you&rsquo;re approved, signing in takes you straight into your workspace.
            </p>
            {!owner && (
              <p className="mt-3 text-sm text-muted">You can see this because your company&rsquo;s owner invited you. You&rsquo;ll get access once the company is approved.</p>
            )}
          </div>
        ) : (
          <div data-testid="under-review-rejected">
            <p className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-red-800">
              Not approved
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">{held.organizationName} isn&rsquo;t approved yet</h1>
            <p className="mt-3 text-base text-muted">
              We couldn&rsquo;t confirm this business from the details we have{held.decidedAt ? ` (reviewed ${day(held.decidedAt)})` : ""}.
            </p>
            {held.reason && (
              <p className="mt-4 rounded-lg border border-line bg-white p-4 text-sm text-ink" data-testid="rejection-reason">
                <strong>What we need:</strong> {held.reason}
              </p>
            )}
            {owner ? (
              <>
                <p className="mt-4 text-base text-muted">Fix what&rsquo;s wrong below and send your details again. We&rsquo;ll review them as soon as we can.</p>
                <ResubmitForm />
              </>
            ) : (
              <p className="mt-4 text-base text-muted">Your company&rsquo;s owner can fix this and send the details again.</p>
            )}
          </div>
        )}
        <form action={logout} className="mt-8">
          <button type="submit" className={authBtnSecondary}>
            Sign out
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
