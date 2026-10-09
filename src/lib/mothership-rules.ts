// What each level of the mothership's staff may do. Pure (no database), so the screens and the server actions agree and the tests
// can cover every combination. The Owner is the Owner role of a platform company; the other levels come from the platform_staff table.

export type StaffLevel = "owner" | "co_owner" | "admin" | "support";

/** Levels that can be handed out on the Staff page (the Owner is never handed out). */
export const GRANTABLE_LEVELS: Exclude<StaffLevel, "owner">[] = ["co_owner", "admin", "support"];

export const LEVEL_LABELS: Record<StaffLevel, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  admin: "Admin",
  support: "Customer support",
};

export const LEVEL_BLURBS: Record<StaffLevel, string> = {
  owner: "Everything, including who the staff are.",
  co_owner: "Everything, including adding and removing staff.",
  admin: "Everything, and can add or remove customer support people.",
  support: "Sees every company and helps them (tickets, looking at their account when they allow it). No Settings, no approving, suspending or banning.",
};

export function isLevel(v: unknown): v is StaffLevel {
  return v === "owner" || v === "co_owner" || v === "admin" || v === "support";
}

/** Owner, co-owner and admin: complete access (settings, approvals, feature rollout, Jin library, proof documents). */
export function isFullLevel(l: StaffLevel | null): boolean {
  return l === "owner" || l === "co_owner" || l === "admin";
}

/** Anyone on the mothership's team, customer support included: the Companies tab, the Support inbox and looking at a company. */
export function isStaffLevel(l: StaffLevel | null): boolean {
  return l !== null;
}

/** Support people never open the company Settings (apart from their own account page). */
export function mayOpenSettings(l: StaffLevel | null): boolean {
  return l !== "support";
}

/** Who may add, change or remove a staff person at `target`'s level. Nobody can touch the Owner; admins only manage customer support. */
export function mayManageLevel(actor: StaffLevel | null, target: StaffLevel): boolean {
  if (target === "owner") return false;
  if (actor === "owner" || actor === "co_owner") return true;
  if (actor === "admin") return target === "support";
  return false;
}

/** Only the Owner and co-owners see the whole Staff page (admins see it too, but only for customer support). */
export function mayOpenStaffPage(l: StaffLevel | null): boolean {
  return l === "owner" || l === "co_owner" || l === "admin";
}
