// Who may do what with QuickBooks. Connecting and disconnecting: an owner or admin. Seeing saved reports: anyone who can open Sales
// or Accounts (profit and loss: Accounts only). Pulling a fresh copy or uploading a file: people who can work in Sales or Accounts.

import { canViewAccounts, canViewSales, canWriteAccounts, canWriteSales, isAdmin, type Access } from "@/lib/permissions";
import type { ReportKind } from "@/lib/quickbooks-rules";

export const canConnectQuickBooks = (role: string) => isAdmin(role);

export function canSeeReport(role: string, access: Access | undefined, kind: ReportKind): boolean {
  if (kind === "PNL") return canViewAccounts(role, access);
  return canViewAccounts(role, access) || canViewSales(role, access);
}

export const canPullReports = (role: string, access?: Access) => isAdmin(role) || canWriteAccounts(role, access) || canWriteSales(role, access);
