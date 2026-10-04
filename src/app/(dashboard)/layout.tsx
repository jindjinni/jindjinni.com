import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { TERMS_VERSION } from "@/lib/legal";
import { requireOrg } from "@/lib/tenant";
import { logout } from "@/app/actions/auth";
import { ROLE_LABELS, canViewPurchasing, canViewReceiving, isPurchasingManager } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Runs on every dashboard route: no session -> /login, no org -> /onboarding.
  const org = await requireOrg();

  // Everyone agrees to the current Terms once (people who joined before they
  // existed, or when they change, are asked here).
  const [me] = await db.select({ termsVersion: users.termsVersion }).from(users).where(eq(users.id, org.userId)).limit(1);
  if (me?.termsVersion !== TERMS_VERSION) redirect("/accept-terms");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {org.organizationName}
          </span>
          <nav className="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
            {canViewPurchasing(org.role) && (
              <Link href="/dashboard/purchasing" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                Purchasing
              </Link>
            )}
            {canViewReceiving(org.role) && (
              <Link href="/dashboard/receiving" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                Receiving
              </Link>
            )}
            {isPurchasingManager(org.role) && (
              <Link href="/dashboard/database" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                Database
              </Link>
            )}
            <Link href="/dashboard/settings" className="hover:text-emerald-700 dark:hover:text-emerald-400">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            {ROLE_LABELS[org.role] ?? org.role}
          </span>
          <form action={logout}>
            <button className="hover:text-emerald-700 dark:hover:text-emerald-400">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
