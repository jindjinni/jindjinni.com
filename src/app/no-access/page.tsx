import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { AuthCard, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";

export default function NoAccessPage() {
  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your access is turned off</h1>
        <p className="mt-3 text-base text-muted">
          An admin switched off your access to this workspace. If you think that&rsquo;s a mistake, ask them to turn it back on.
        </p>
        <form action={logout} className="mt-8">
          <button type="submit" className={authBtnPrimary}>
            Sign out
          </button>
        </form>
        <p className="mt-6 text-sm text-muted">
          <Link href="/login" className="font-semibold underline">
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
