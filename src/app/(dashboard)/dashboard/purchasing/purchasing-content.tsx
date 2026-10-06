"use client";

import { usePathname } from "next/navigation";

/** The page area beside the sidebar. Most pages sit in a readable column; the Quotations summary is a wide table and gets the full width. */
export function PurchasingContent({ children }: { children: React.ReactNode }) {
  const wide = usePathname() === "/dashboard/purchasing/quotations";
  return <div className={`pz mx-auto w-full px-6 py-8 print:max-w-none print:p-0 ${wide ? "max-w-none" : "max-w-6xl"}`}>{children}</div>;
}
