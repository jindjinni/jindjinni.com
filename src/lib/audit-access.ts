// Who may open the Audit Center and who may change things in it. The Audit Center exists only in a Distribution operation (a Wholesale
// operation never has it, even with "show every tab"), only for people who can open Accounts, and only while the staged rollout
// switch `audit-center` is on for the company.

import { featureOn } from "@/lib/features";
import { tabViewOf } from "@/lib/operations-service";
import { canViewAccounts, canWritePayment, isAdmin } from "@/lib/permissions";
import type { CurrentOrg } from "@/lib/tenant";

export type AuditAccess = { allowed: boolean; canWork: boolean; isManager: boolean };

/** True when this workspace has a Distribution side and the feature is on (the menu and the pages both use this). */
export async function auditCenterOn(organizationId: string): Promise<boolean> {
  const view = await tabViewOf(organizationId);
  if (!view.sides.distribution) return false;
  return featureOn("audit-center", organizationId);
}

export async function auditAccess(org: CurrentOrg): Promise<AuditAccess> {
  if (!canViewAccounts(org.role, org.access)) return { allowed: false, canWork: false, isManager: false };
  if (!(await auditCenterOn(org.organizationId))) return { allowed: false, canWork: false, isManager: false };
  // "Audit staff" = people who can work in Accounts (accountant, Admin, Owner). Anyone who can only look gets a read-only view. A platform
  // person looking through "View as company" never changes anything.
  return { allowed: true, canWork: !org.viewAs && canWritePayment(org.role, org.access), isManager: !org.viewAs && isAdmin(org.role) };
}
