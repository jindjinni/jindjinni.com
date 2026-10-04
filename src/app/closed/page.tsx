import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { getClosedCompanyForUser, getSessionUserId } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { AuthCard, AuthShell, authBtnPrimary, authBtnSecondary } from "@/components/auth/auth-ui";
import { RestoreForm } from "./restore-form";

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function ClosedPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const closed = await getClosedCompanyForUser(userId);
  if (!closed) redirect("/dashboard");

  const owner = isOwner(closed.role);
  const expired = closed.expired;

  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{closed.organizationName} is closed</h1>
        {owner ? (
          <>
            <p className="mt-3 text-base text-muted">
              You closed this company on {day(closed.closedAt)}. Your team is locked out.
              {closed.purgeAfter && !expired && (
                <> You can reopen it until <strong className="text-ink">{day(closed.purgeAfter)}</strong>; after that, everything is permanently deleted.</>
              )}
            </p>
            {expired ? (
              <p className="mt-4 text-base text-muted">The 30 days are up, so this company can no longer be reopened.</p>
            ) : (
              <>
                <RestoreForm />
                <a href="/api/settings/export" className={`${authBtnSecondary} mt-4`}>
                  Download my data first
                </a>
              </>
            )}
          </>
        ) : (
          <p className="mt-3 text-base text-muted">
            The owner closed this company, so no one can sign in to it right now. If you think that&rsquo;s a mistake, contact the owner.
          </p>
        )}
        <form action={logout} className="mt-8">
          <button type="submit" className={owner && !expired ? "text-sm font-bold text-muted underline" : authBtnPrimary}>
            Sign out
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
