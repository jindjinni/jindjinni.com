"use server";

// Saves how the signed-in person arranged their own Home screen (order and open sections). Nothing else is touched, and
// nothing is saved while a platform person is only looking at a company through "View as company".

import { requireOrg } from "@/lib/tenant";
import { saveDashboardLayout as save } from "@/lib/dashboard-layout-service";

export async function saveDashboardLayout(raw: unknown): Promise<{ ok: boolean }> {
  const org = await requireOrg();
  if (org.viewAs) return { ok: false };
  await save(org.userId, org.organizationId, raw);
  return { ok: true };
}
