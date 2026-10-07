// Who can do what. Every role/permission decision in the app goes through
// the helpers below, so adding a department or a role later means editing
// this one file -- never a scattered `role === "staff"` check.
//
// Roles (stored in memberships.role):
//   owner               the person who created the company -- everything, incl. the Admin panel
//   admin               everything, incl. the Admin panel (only the owner can make/remove admins)
//   purchasing_manager  Purchasing with manager powers (price overrides, archive, settings tabs)
//   purchasing_agent    Purchasing day-to-day: customers, quotations, labels -- no overrides/settings
//   receiver            Receiving department only -- no Purchasing access
//   accountant          Purchasing in view-only mode (quotations, customers, receipts, audit log)
//   customer_service    Customer Service department only (emails paid customers) -- no Purchasing, Receiving or Accounts
//   staff               legacy role from before the Admin panel; behaves exactly like purchasing_agent

export const ROLES = [
  "owner",
  "admin",
  "purchasing_manager",
  "purchasing_agent",
  "receiver",
  "accountant",
  "customer_service",
  "staff",
] as const;
export type Role = (typeof ROLES)[number];

/** Roles an admin can hand out when inviting or editing someone ("owner" and legacy "staff" are never assigned). */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "purchasing_manager", "purchasing_agent", "receiver", "accountant", "customer_service"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  purchasing_manager: "Purchasing Manager",
  purchasing_agent: "Purchasing Agent",
  receiver: "Receiver",
  accountant: "Accountant",
  customer_service: "Customer Service",
  staff: "Purchasing Agent",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access to everything, including the Admin panel.",
  admin: "Full access to everything, including inviting and managing the team.",
  purchasing_manager: "Everything in Purchasing, including price overrides, archiving, bonus tiers, conditions and settings.",
  purchasing_agent: "Purchasing day-to-day: customers, quotations and shipping labels. No price overrides or settings.",
  receiver: "Receiving department: log incoming packages, photos and checks. No access to Purchasing.",
  accountant: "View-only access to Purchasing: quotations, customers, receipts and the audit log.",
  customer_service: "Customer Service department: email customers once they've been paid. No access to Purchasing, Receiving or Accounts.",
  staff: "Purchasing day-to-day: customers, quotations and shipping labels.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Owner or Admin: company identity, Business settings and the Admin panel. */
export function isAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Purchasing manager powers (overrides, archive, settings tabs, Database view). Admins and the owner always have them. */
export function isPurchasingManager(role: string): boolean {
  return role === "owner" || role === "admin" || role === "purchasing_manager";
}

/** May open the Purchasing department at all (accountants view only). */
export function canViewPurchasing(role: string): boolean {
  return role !== "receiver" && role !== "customer_service";
}

/** May change data in Purchasing (everyone who can view it except accountants). */
export function canWritePurchasing(role: string): boolean {
  return canViewPurchasing(role) && role !== "accountant";
}

/** May open the Receiving department (every role can look, except Customer Service; Purchasing roles and accountants are view-only there). */
export function canViewReceiving(role: string): boolean {
  return (ROLES as readonly string[]).includes(role) && role !== "customer_service";
}

/**
 * May open the files Receiving stores for an order (photos, the payment receipt, the adjustment quotation PDF).
 * Customer Service needs these to check what is attached to the customer's email, without opening Receiving itself.
 */
export function canOpenReceivingFiles(role: string): boolean {
  return canViewReceiving(role) || role === "customer_service";
}

/** May change data in Receiving: the Receiver role, Admin and the Owner. */
export function canWriteReceiving(role: string): boolean {
  return role === "receiver" || isAdmin(role);
}

/** May change the Accounts part of a shipment (decision, status, payment proof): everyone who can write in Receiving, plus the accountant. */
export function canWriteAccounts(role: string): boolean {
  return canWriteReceiving(role) || role === "accountant";
}

/**
 * May change the payment part of a shipment -- Step 10 "Accounts" (Accounts Status, Paid date, payment confirmation
 * photo) and moving an order into or out of Paid. Receiving staff can't: only the accountant, Admin and Owner.
 */
export function canWritePayment(role: string): boolean {
  return role === "accountant" || isAdmin(role);
}

/** May open the Accounts department (the orders waiting to be paid and the Paid Orders database): the accountant, Admin and the Owner. */
export function canViewAccounts(role: string): boolean {
  return canWritePayment(role);
}

/** May open the Customer Service department (the paid orders waiting for their email, and the Emailed database): Customer Service, Admin and the Owner. */
export function canViewCustomerService(role: string): boolean {
  return role === "customer_service" || isAdmin(role);
}

/** May send the customer emails. Same people who can open the department. */
export function canSendCustomerEmails(role: string): boolean {
  return canViewCustomerService(role);
}

/** May open the Inventory department (live stock): everyone except Customer Service. */
export function canViewInventory(role: string): boolean {
  return (ROLES as readonly string[]).includes(role) && role !== "customer_service";
}

/** May change Inventory (manual adds, estimated prices): Purchasing managers, Admin and the Owner. Everyone else looks. */
export function canWriteInventory(role: string): boolean {
  return isPurchasingManager(role);
}

/** May open the Sales department (quotations, invoices, buyers, price comparison): the Purchasing roles, the accountant (look only), Admin and the Owner. */
export function canViewSales(role: string): boolean {
  return canViewPurchasing(role);
}

/** May create and send quotations and invoices, and keep the buyers and their price sheets: everyone who can view Sales except the accountant. */
export function canWriteSales(role: string): boolean {
  return canWritePurchasing(role);
}

/** May change the company profile invoices come from and its numbering: Purchasing managers, Admin and the Owner. */
export function canManageSalesSettings(role: string): boolean {
  return isPurchasingManager(role);
}

/** May open the HR department (staff list, activity log, time sheets): Admin and the Owner only. */
export function canViewHr(role: string): boolean {
  return isAdmin(role);
}

/** May open Marketing (contacts, email and text campaigns) and send campaigns: Admin, the Owner and Purchasing managers. */
export function canViewMarketing(role: string): boolean {
  return isAdmin(role) || isPurchasingManager(role);
}

/** May press "Refresh now" on the Home screen's industry news: Admin, the Owner and Purchasing managers. Everyone signed in can read it. */
export function canRefreshIndustryNews(role: string): boolean {
  return isAdmin(role) || isPurchasingManager(role);
}

/** Which departments a role can open, for the menu and the home redirect. */
export function departmentsFor(role: string): string[] {
  const out: string[] = [];
  if (canViewPurchasing(role)) out.push("purchasing");
  if (canViewReceiving(role)) out.push("receiving");
  if (canViewAccounts(role)) out.push("accounts");
  if (canViewCustomerService(role)) out.push("customer-service");
  if (canViewInventory(role)) out.push("inventory");
  if (canViewSales(role)) out.push("sales");
  if (canViewHr(role)) out.push("hr");
  if (canViewMarketing(role)) out.push("marketing");
  return out;
}

/** Only the person who owns the company may close it. */
export function isOwner(role: string): boolean {
  return role === "owner";
}

export type SettingsSection = {
  href: string;
  label: string;
  /** Short line shown under the title on the section's page. */
  blurb: string;
};

/** Which Settings sections a role sees in the left menu (the pages re-check on the server). */
export function settingsSectionsFor(role: string): SettingsSection[] {
  const out: SettingsSection[] = [
    { href: "/dashboard/settings/account", label: "My account", blurb: "Your name, password and role." },
  ];
  out.push({ href: "/dashboard/settings/business-profile", label: "Business profile", blurb: "Your company's official details." });
  out.push({ href: "/dashboard/settings/appearance", label: "Appearance", blurb: "Your company's color theme." });
  if (isAdmin(role)) {
    out.push({ href: "/dashboard/settings/business", label: "Shipping & labels", blurb: "The return address printed on labels." });
    out.push({ href: "/dashboard/settings/team", label: "Team & access", blurb: "Invite people and choose their role." });
    out.push({ href: "/dashboard/settings/billing", label: "Plan & billing", blurb: "Your plan and team size." });
  }
  out.push({ href: "/dashboard/settings/activity", label: "Security & activity", blurb: "Sign-ins and changes." });
  if (isPurchasingManager(role)) {
    out.push({ href: "/dashboard/settings/archive", label: "Archive", blurb: "Archived quotations, products and customers, and how to restore them." });
  }
  if (isPurchasingManager(role) || role === "accountant") {
    out.push({ href: "/dashboard/settings/audit-log", label: "Audit log", blurb: "Every price override and other audited change in Purchasing." });
  }
  if (isPurchasingManager(role)) {
    out.push({ href: "/dashboard/settings/database", label: "Database", blurb: "A read-only view of every Purchasing table." });
  }
  if (isOwner(role)) {
    out.push({ href: "/dashboard/settings/close-company", label: "Close company", blurb: "Download your data or close the account." });
  }
  return out;
}
