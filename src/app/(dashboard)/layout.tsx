import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { logout } from "@/app/actions/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Runs on every dashboard route: no session -> /login, no org -> /onboarding.
  const org = await requireOrg();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {org.organizationName}
          </span>
          <nav className="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
            <Link href="/dashboard/purchasing" className="hover:text-emerald-700 dark:hover:text-emerald-400">
              Purchasing
            </Link>
            {org.role !== "staff" && (
              <Link href="/dashboard/database" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                Database
              </Link>
            )}
            <Link href="/dashboard/profile" className="hover:text-emerald-700 dark:hover:text-emerald-400">
              Profile
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            {org.role}
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
