import { canViewAccounts, canViewCustomerService, canViewHr, canViewInventory, canViewMarketing, canViewPurchasing, canViewReceiving, canViewSales, canViewShipping } from "@/lib/permissions";

export type TopLink = { id: string; href: string; label: string };

/** Every link this person could have in the top bar, in the original order, before the company's own order, names and hiding are applied. */
export function topLinksFor(
  org: { role: string; access: Parameters<typeof canViewPurchasing>[1] },
  o: { shippingOn: boolean; showSupport: boolean; viewing: boolean; level: string | null; lampLabel: string; settingsLabel: string },
): TopLink[] {
  const L = (id: string, href: string, label: string): TopLink[] => [{ id, href, label }];
  return [
    ...L("home", "/dashboard", "Home"),
    ...(canViewPurchasing(org.role, org.access) ? L("purchasing", "/dashboard/purchasing", "Purchasing") : []),
    ...(canViewReceiving(org.role, org.access) ? L("receiving", "/dashboard/receiving", "Receiving") : []),
    ...(canViewAccounts(org.role, org.access) ? L("accounts", "/dashboard/accounts", "Accounts") : []),
    ...(canViewCustomerService(org.role, org.access) ? L("customer-service", "/dashboard/customer-service", "Customer Service") : []),
    ...(canViewInventory(org.role, org.access) ? L("inventory", "/dashboard/inventory", "Inventory") : []),
    ...(canViewSales(org.role, org.access) ? L("sales", "/dashboard/sales", "Sales") : []),
    ...(o.shippingOn && canViewShipping(org.role, org.access) ? L("shipping", "/dashboard/shipping", "Shipping") : []),
    ...(canViewMarketing(org.role, org.access) ? L("marketing", "/dashboard/marketing", "Marketing") : []),
    ...(canViewHr(org.role) ? L("hr", "/dashboard/hr", "HR") : []),
    ...(o.viewing ? [] : L("chat", "/dashboard/chat", "Chat")),
    ...(o.showSupport ? L("support", "/dashboard/support", "Support") : []),
    ...(o.level ? L("lamp", "/dashboard/lamp", o.lampLabel) : []),
    ...L("settings", "/dashboard/settings", o.settingsLabel),
  ];
}
