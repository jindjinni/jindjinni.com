"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavEntry = {
  href: string;
  label: string;
  icon?: string;
  /** Setup and record-keeping pages: listed under a "Setup" heading, a little quieter. */
  secondary?: boolean;
};

const HOME = "/dashboard/purchasing";

/**
 * The Purchasing sidebar, the same design as Receiving's: a colored column down the left with the company name,
 * the everyday pages first, then the Setup pages under their own heading. On a phone it becomes a scrolling row.
 */
export function PurchasingNav({ orgName, items }: { orgName: string; items: NavEntry[] }) {
  const path = usePathname();
  const main = items.filter((i) => !i.secondary);
  const setup = items.filter((i) => i.secondary);
  const isActive = (href: string) => (href === HOME ? path === HOME : path === href || path.startsWith(href + "/"));
  const link = (i: NavEntry) => {
    const active = isActive(i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${i.secondary ? "text-[13px] md:pl-9" : "text-sm"} ${
          active ? "bg-emerald-950/15 font-semibold" : "font-medium hover:bg-emerald-950/10"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-950`}
      >
        {i.icon && <span aria-hidden="true">{i.icon}</span>}
        {i.label}
      </Link>
    );
  };
  return (
    <aside className="shrink-0 bg-[var(--dept-accent,#34d399)] text-emerald-950 md:w-56 print:hidden">
      <div className="px-5 pb-3 pt-5 md:pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/70">Purchasing Department</p>
        <p className="mt-1 text-lg font-bold leading-tight">{orgName}</p>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:items-stretch md:pb-6" aria-label="Purchasing sections">
        {main.map(link)}
        {setup.length > 0 && (
          <>
            <p className="whitespace-nowrap px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-950/60 md:pt-4">Setup</p>
            {setup.map(link)}
          </>
        )}
      </nav>
    </aside>
  );
}

/** The page area beside the sidebar. Most pages sit in a readable column; the Quotations summary is a wide table and gets the full width. */
export function PurchasingContent({ children }: { children: React.ReactNode }) {
  const wide = usePathname() === "/dashboard/purchasing/quotations";
  return <div className={`pz mx-auto w-full px-6 py-8 print:max-w-none print:p-0 ${wide ? "max-w-none" : "max-w-6xl"}`}>{children}</div>;
}
