// The permission questions Jin's tools ask, in one place. They use the same functions as the pages themselves, so Jin
// can never show someone what their own screens would not.

import { canViewAccounts as va, canViewInventory as vi, canViewPurchasing as vp, canViewReceiving as vr, type Access } from "@/lib/permissions";

export type CurrentOrgLike = { userId: string; organizationId: string; role: string; access: Access };

export const canViewPurchasing = (w: CurrentOrgLike) => vp(w.role, w.access);
export const canViewReceiving = (w: CurrentOrgLike) => vr(w.role, w.access);
export const canViewAccounts = (w: CurrentOrgLike) => va(w.role, w.access);
export const canViewInventory = (w: CurrentOrgLike) => vi(w.role, w.access);
