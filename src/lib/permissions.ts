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
//   custom              starts with no departments; the admin hand-picks them (see Access below)
//   staff               legacy role from before the Admin panel; behaves exactly like purchasing_agent

export const ROLES = [
  "owner",
  "admin",
  "purchasing_manager",
  "purchasing_agent",
  "receiver",
  "accountant",
  "customer_service",
  "custom",
  "staff",
] as const;
export type Role = (typeof ROLES)[number];

/** Roles an admin can hand out when inviting or editing someone ("owner" and legacy "staff" are never assigned). */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "purchasing_manager", "purchasing_agent", "receiver", "accountant", "customer_service", "custom"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  purchasing_manager: "Purchasing Manager",
  purchasing_agent: "Purchasing Agent",
  receiver: "Receiver",
  accountant: "Accountant",
  customer_service: "Customer Service",
  custom: "Custom access",
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
  custom: "Starts with no departments at all. You pick exactly which departments they can see or work in.",
  staff: "Purchasing day-to-day: customers, quotations and shipping labels.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Hand-picked access. A role is the starting point; on top of it an admin can
// open any other department for one person, either to LOOK ("view") or to
// WORK in it ("work"). It only ever adds -- to take something away, give the
// person a smaller role (or "Custom access", which starts empty). HR, the Admin
// panel, price overrides and archive/settings powers stay with the role.
// ---------------------------------------------------------------------------

/** The departments an admin can open for someone by hand (HR is always admin-only). */
export const GRANTABLE_DEPTS = ["purchasing", "receiving", "accounts", "customer-service", "inventory", "sales", "marketing"] as const;
export type GrantableDept = (typeof GRANTABLE_DEPTS)[number];
export type DeptLevel = "view" | "work";
export type Access = Partial<Record<GrantableDept, DeptLevel>>;

export const GRANTABLE_DEPT_LABELS: Record<GrantableDept, string> = {
  purchasing: "Purchasing",
  receiving: "Receiving",
  accounts: "Accounts",
  "customer-service": "Customer Service",
  inventory: "Inventory",
  sales: "Sales",
  marketing: "Marketing",
};

/** Departments where "see" and "use" are the same thing, so the picker offers only "Can use". */
export const USE_ONLY_DEPTS: GrantableDept[] = ["customer-service", "marketing"];

/** Reads the JSON saved in memberships.dept_access; anything unreadable or unknown is ignored (never throws). */
export function parseAccess(raw: string | null | undefined): Access {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Access = {};
    for (const dept of GRANTABLE_DEPTS) {
      const level = (parsed as Record<string, unknown>)[dept];
      if (level === "view" || level === "work") out[dept] = level;
    }
    return out;
  } catch {
    return {};
  }
}

/** The JSON to store, or null when nothing extra is granted. */
export function serializeAccess(access: Access): string | null {
  const clean: Access = {};
  for (const dept of GRANTABLE_DEPTS) {
    const level = access[dept];
    if (level === "view" || level === "work") clean[dept] = level;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

/** Reads the picker's form fields (access_<dept> = "" | "view" | "work"). */
export function accessFromForm(formData: FormData): Access {
  const out: Access = {};
  for (const dept of GRANTABLE_DEPTS) {
    const v = String(formData.get(`access_${dept}`) ?? "");
    if (v === "view" || v === "work") out[dept] = USE_ONLY_DEPTS.includes(dept) ? "work" : v;
  }
  return out;
}

const sees = (access: Access | undefined, dept: GrantableDept) => !!access?.[dept];
const works = (access: Access | undefined, dept: GrantableDept) => access?.[dept] === "work";

/** Owner or Admin: company identity, Business settings and the Admin panel. */
export function isAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Purchasing manager powers (overrides, archive, settings tabs, Database view). Admins and the owner always have them. */
export function isPurchasingManager(role: string): boolean {
  return role === "owner" || role === "admin" || role === "purchasing_manager";
}

/** Roles that open Purchasing (and Sales) on their own. */
function rolePurchasing(role: string): boolean {
  return ["owner", "admin", "purchasing_manager", "purchasing_agent", "accountant", "staff"].includes(role);
}

/** Roles that can look at Receiving and Inventory on their own (everyone except Customer Service and Custom access). */
function roleLooksAtReceiving(role: string): boolean {
  return (ROLES as readonly string[]).includes(role) && role !== "customer_service" && role !== "custom";
}

/** May open the Purchasing department at all (accountants view only). */
export function canViewPurchasing(role: string, access?: Access): boolean {
  return rolePurchasing(role) || sees(access, "purchasing");
}

/** May change data in Purchasing (everyone who can view it by role except accountants, or anyone given "work"). */
export function canWritePurchasing(role: string, access?: Access): boolean {
  return (rolePurchasing(role) && role !== "accountant") || works(access, "purchasing");
}

/** May open the Receiving department (every role can look, except Customer Service and Custom access; Purchasing roles and accountants are view-only there). */
export function canViewReceiving(role: string, access?: Access): boolean {
  return roleLooksAtReceiving(role) || sees(access, "receiving");
}

/**
 * May open the files Receiving stores for an order (photos, the payment receipt, the adjustment quotation PDF).
 * Customer Service needs these to check what is attached to the customer's email, without opening Receiving itself.
 */
export function canOpenReceivingFiles(role: string, access?: Access): boolean {
  return canViewReceiving(role, access) || role === "customer_service" || sees(access, "customer-service");
}

/** May change data in Receiving: the Receiver role, Admin and the Owner, or anyone given "work" there. */
export function canWriteReceiving(role: string, access?: Access): boolean {
  return role === "receiver" || isAdmin(role) || works(access, "receiving");
}

/** May change the Accounts part of a shipment (decision, status, payment proof): everyone who can write in Receiving, plus the accountant. */
export function canWriteAccounts(role: string, access?: Access): boolean {
  return canWriteReceiving(role, access) || role === "accountant" || works(access, "accounts");
}

/**
 * May change the payment part of a shipment -- Step 10 "Accounts" (Accounts Status, Paid date, payment confirmation
 * photo) and moving an order into or out of Paid. Receiving staff can't: only the accountant, Admin and Owner
 * (or anyone given "work" in Accounts).
 */
export function canWritePayment(role: string, access?: Access): boolean {
  return role === "accountant" || isAdmin(role) || works(access, "accounts");
}

/** May open the Accounts department (the orders waiting to be paid and the Paid Orders database): the accountant, Admin and the Owner, or anyone given Accounts. */
export function canViewAccounts(role: string, access?: Access): boolean {
  return role === "accountant" || isAdmin(role) || sees(access, "accounts");
}

/** May open the Customer Service department (the paid orders waiting for their email, and the Emailed database): Customer Service, Admin and the Owner, or anyone given it. */
export function canViewCustomerService(role: string, access?: Access): boolean {
  return role === "customer_service" || isAdmin(role) || sees(access, "customer-service");
}

/** May send the customer emails. Same people who can open the department. */
export function canSendCustomerEmails(role: string, access?: Access): boolean {
  return role === "customer_service" || isAdmin(role) || works(access, "customer-service");
}

/** May open the Inventory department (live stock): everyone except Customer Service and Custom access, or anyone given it. */
export function canViewInventory(role: string, access?: Access): boolean {
  return roleLooksAtReceiving(role) || sees(access, "inventory");
}

/** May change Inventory (manual adds, estimated prices): Purchasing managers, Admin and the Owner, or anyone given "work". Everyone else looks. */
export function canWriteInventory(role: string, access?: Access): boolean {
  return isPurchasingManager(role) || works(access, "inventory");
}

/** May open the Sales department (quotations, invoices, buyers, price comparison): the Purchasing roles, the accountant (look only), Admin and the Owner, or anyone given Sales. */
export function canViewSales(role: string, access?: Access): boolean {
  return rolePurchasing(role) || sees(access, "sales");
}

/** May create and send quotations and invoices, and keep the buyers and their price sheets: everyone who can view Sales by role except the accountant, or anyone given "work". */
export function canWriteSales(role: string, access?: Access): boolean {
  return (rolePurchasing(role) && role !== "accountant") || works(access, "sales");
}

/** May change the company profile invoices come from and its numbering: Purchasing managers, Admin and the Owner. */
export function canManageSalesSettings(role: string): boolean {
  return isPurchasingManager(role);
}

/** May open the HR department (staff list, activity log, time sheets): Admin and the Owner only. */
export function canViewHr(role: string): boolean {
  return isAdmin(role);
}

/** May open Marketing (contacts, email and text campaigns) and send campaigns: Admin, the Owner and Purchasing managers, or anyone given it. */
export function canViewMarketing(role: string, access?: Access): boolean {
  return isAdmin(role) || isPurchasingManager(role) || sees(access, "marketing");
}

/** May press "Refresh now" on the Home screen's industry news: Admin, the Owner and Purchasing managers. Everyone signed in can read it. */
export function canRefreshIndustryNews(role: string): boolean {
  return isAdmin(role) || isPurchasingManager(role);
}

/** The Home screen's "Company performance" (quotes, receiving, money to pay) is for the owner and the admins only. */
export function canViewCompanyPerformance(role: string): boolean {
  return isAdmin(role);
}

/** Which departments a person can open, for the menu, the chat rooms and the home redirect. */
export function departmentsFor(role: string, access?: Access): string[] {
  const out: string[] = [];
  if (canViewPurchasing(role, access)) out.push("purchasing");
  if (canViewReceiving(role, access)) out.push("receiving");
  if (canViewAccounts(role, access)) out.push("accounts");
  if (canViewCustomerService(role, access)) out.push("customer-service");
  if (canViewInventory(role, access)) out.push("inventory");
  if (canViewSales(role, access)) out.push("sales");
  if (canViewHr(role)) out.push("hr");
  if (canViewMarketing(role, access)) out.push("marketing");
  return out;
}

/** What a role gives on its own in a department, before any hand-picked extras: nothing, look only, or work. */
export function roleBaseLevel(role: string, dept: GrantableDept): "none" | DeptLevel {
  switch (dept) {
    case "purchasing":
      return canWritePurchasing(role) ? "work" : canViewPurchasing(role) ? "view" : "none";
    case "receiving":
      return canWriteReceiving(role) ? "work" : canViewReceiving(role) ? "view" : "none";
    case "accounts":
      return canWritePayment(role) ? "work" : canViewAccounts(role) ? "view" : "none";
    case "customer-service":
      return canSendCustomerEmails(role) ? "work" : canViewCustomerService(role) ? "view" : "none";
    case "inventory":
      return canWriteInventory(role) ? "work" : canViewInventory(role) ? "view" : "none";
    case "sales":
      return canWriteSales(role) ? "work" : canViewSales(role) ? "view" : "none";
    case "marketing":
      return canViewMarketing(role) ? "work" : "none";
  }
}

/** Short plain-language summary of the hand-picked extras, e.g. "Receiving (view), Sales (work)". Empty when there are none. */
export function describeAccess(access: Access): string {
  return GRANTABLE_DEPTS.filter((d) => access[d])
    .map((d) => `${GRANTABLE_DEPT_LABELS[d]} (${USE_ONLY_DEPTS.includes(d) ? "use" : access[d]})`)
    .join(", ");
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
    out.push({ href: "/dashboard/settings/start-fresh", label: "Start fresh", blurb: "Clear the test quotations so the company is ready for real ones." });
    out.push({ href: "/dashboard/settings/close-company", label: "Close company", blurb: "Download your data or close the account." });
  }
  return out;
}
