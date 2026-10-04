"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/receiving", label: "All Shipments", icon: "📦", exact: true },
  { href: "/dashboard/receiving/intake", label: "Receiving Intake Form", icon: "📝", exact: false },
  { href: "/dashboard/receiving/received-items", label: "Received Items", icon: "📋", exact: false },
  { href: "/dashboard/receiving/products", label: "Products", icon: "🏷️", exact: false },
  { href: "/dashboard/receiving/adjustments", label: "Order Adjustments", icon: "🧾", exact: false },
];

const ADMIN_ITEMS = [{ href: "/dashboard/receiving/email-settings", label: "Email Settings", icon: "✉️", exact: false }];

export function ReceivingNav({ orgName, isAdminUser }: { orgName: string; isAdminUser: boolean }) {
  const path = usePathname();
  const items = isAdminUser ? [...ITEMS, ...ADMIN_ITEMS] : ITEMS;
  return (
    <aside className="shrink-0 bg-[#F7B838] text-amber-950 md:w-60 print:hidden">
      <div className="px-5 pb-3 pt-5 md:pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-950/70">Receiving Department</p>
        <p className="mt-1 text-lg font-bold leading-tight">{orgName}</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-6" aria-label="Receiving">
        {items.map((i) => {
          const active = i.exact ? path === i.href : path.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-amber-950/15 font-semibold" : "hover:bg-amber-950/10"
              } focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-950`}
            >
              <span aria-hidden="true">{i.icon}</span>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
