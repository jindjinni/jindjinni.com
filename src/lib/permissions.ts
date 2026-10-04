// Who can do what. Every role/permission decision in the app goes through
// the helpers below, so adding a department or a role later means editing
// this one file -- never a scattered `role === "staff"` check.
//
// Roles (stored in memberships.role):
//   owner               the person who created the company -- everything, incl. the Admin panel
//   admin               everything, incl. the Admin panel (only the owner can make/remove admins)
//   purchasing_manager  Purchasing with manager powers (price overrides, archive, settings tabs)
//   purchasing_agent    Purchasing day-to-day: customers, quotations, labels -- no overrides/settings
//   receiver            Receiving department (being built -- no Purchasing access)
//   accountant          Purchasing in view-only mode (quotations, customers, receipts, audit log)
//   staff               legacy role from before the Admin panel; behaves exactly like purchasing_agent

export const ROLES = [
  "owner",
  "admin",
  "purchasing_manager",
  "purchasing_agent",
  "receiver",
  "accountant",
  "staff",
] as const;
export type Role = (typeof ROLES)[number];

/** Roles an admin can hand out when inviting or editing someone ("owner" and legacy "staff" are never assigned). */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "purchasing_manager", "purchasing_agent", "receiver", "accountant"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  purchasing_manager: "Purchasing Manager",
  purchasing_agent: "Purchasing Agent",
  receiver: "Receiver",
  accountant: "Accountant",
  staff: "Purchasing Agent",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access to everything, including the Admin panel.",
  admin: "Full access to everything, including inviting and managing the team.",
  purchasing_manager: "Everything in Purchasing, including price overrides, archiving, bonus tiers, conditions and settings.",
  purchasing_agent: "Purchasing day-to-day: customers, quotations and shipping labels. No price overrides or settings.",
  receiver: "Receiving department (coming soon). No access to Purchasing.",
  accountant: "View-only access to Purchasing: quotations, customers, receipts and the audit log.",
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
  return role !== "receiver";
}

/** May change data in Purchasing (everyone who can view it except accountants). */
export function canWritePurchasing(role: string): boolean {
  return canViewPurchasing(role) && role !== "accountant";
}

/** Which departments a role can open, for the menu and the home redirect. */
export function departmentsFor(role: string): string[] {
  const out: string[] = [];
  if (canViewPurchasing(role)) out.push("purchasing");
  if (role === "receiver" || isAdmin(role)) out.push("receiving");
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
  if (isAdmin(role)) {
    out.push({ href: "/dashboard/settings/business", label: "Shipping & labels", blurb: "The return address printed on labels." });
    out.push({ href: "/dashboard/settings/team", label: "Team & access", blurb: "Invite people and choose their role." });
    out.push({ href: "/dashboard/settings/billing", label: "Plan & billing", blurb: "Your plan and team size." });
  }
  out.push({ href: "/dashboard/settings/activity", label: "Security & activity", blurb: "Sign-ins and changes." });
  if (isOwner(role)) {
    out.push({ href: "/dashboard/settings/close-company", label: "Close company", blurb: "Download your data or close the account." });
  }
  return out;
}
