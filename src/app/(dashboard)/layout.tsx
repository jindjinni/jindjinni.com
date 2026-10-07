import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { TERMS_VERSION } from "@/lib/legal";
import { requireOrg } from "@/lib/tenant";
import { logout } from "@/app/actions/auth";
import { parseDepartmentThemes } from "@/lib/theme";
import { ThemeScope } from "@/components/theme-scope";
import { MainNav, type NavItem } from "./main-nav";
import { ClockWidget } from "@/components/clock-widget";
import { JinWidget } from "@/components/jin/jin-widget";
import { getMyClock } from "@/lib/hr-service";
import { ROLE_LABELS, canViewAccounts, canViewCustomerService, canViewInventory, canViewPurchasing, canViewReceiving, canViewSales, canViewHr, canViewMarketing } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Runs on every dashboard route: no session -> /login, no org -> /onboarding.
  const org = await requireOrg();

  // Everyone agrees to the current Terms once (people who joined before they
  // existed, or when they change, are asked here).
  const [me] = await db.select({ termsVersion: users.termsVersion, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, org.userId)).limit(1);
  if (me?.termsVersion !== TERMS_VERSION) redirect("/accept-terms");

  const [orgRow] = await db.select({ departmentThemes: organizations.departmentThemes }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);

  const nowIso = new Date().toISOString();
  const clock = await getMyClock({ organizationId: org.organizationId, userId: org.userId }, nowIso);
  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Home" },
    ...(canViewPurchasing(org.role, org.access) ? [{ href: "/dashboard/purchasing", label: "Purchasing" }] : []),
    ...(canViewReceiving(org.role, org.access) ? [{ href: "/dashboard/receiving", label: "Receiving" }] : []),
    ...(canViewAccounts(org.role, org.access) ? [{ href: "/dashboard/accounts", label: "Accounts" }] : []),
    ...(canViewCustomerService(org.role, org.access) ? [{ href: "/dashboard/customer-service", label: "Customer Service" }] : []),
    ...(canViewInventory(org.role, org.access) ? [{ href: "/dashboard/inventory", label: "Inventory" }] : []),
    ...(canViewSales(org.role, org.access) ? [{ href: "/dashboard/sales", label: "Sales" }] : []),
    ...(canViewMarketing(org.role, org.access) ? [{ href: "/dashboard/marketing", label: "Marketing" }] : []),
    ...(canViewHr(org.role) ? [{ href: "/dashboard/hr", label: "HR" }] : []),
    { href: "/dashboard/chat", label: "Chat" },
    { href: "/dashboard/settings", label: "Settings" },
  ];

  return (
    <ThemeScope themes={parseDepartmentThemes(orgRow?.departmentThemes)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-white px-6 py-3 shadow-sm print:hidden dark:border-emerald-900/60 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex items-center gap-2.5 font-semibold text-slate-900 dark:text-slate-50">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white" aria-hidden="true">
              {org.organizationName.trim().charAt(0).toUpperCase() || "•"}
            </span>
            {org.organizationName}
          </span>
          <MainNav items={navItems} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <ClockWidget {...clock} nowIso={nowIso} />
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {ROLE_LABELS[org.role] ?? org.role}
          </span>
          <form action={logout}>
            <button className="rounded-md px-2 py-1 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-300">Sign out</button>
          </form>
        </div>
      </header>
      {me?.mustChangePassword && (
        <p className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900 print:hidden dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Your admin gave you a temporary password.{" "}
          <Link href="/dashboard/settings/account" className="font-semibold underline">
            Choose your own password
          </Link>{" "}
          so only you know it.
        </p>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 print:max-w-none print:p-0">{children}</main>
      <JinWidget />
    </ThemeScope>
  );
}
