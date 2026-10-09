// Reading and saving a person's Home screen arrangement. One row per person per company.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dashboardLayouts } from "@/db/schema";
import { defaultLayout, normalizeLayout, parseLayout, serializeLayout, type Layout } from "@/lib/dashboard-layout";

export async function getDashboardLayout(userId: string, organizationId: string): Promise<Layout> {
  try {
    const [row] = await db
      .select({ layout: dashboardLayouts.layout })
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.userId, userId), eq(dashboardLayouts.organizationId, organizationId)))
      .limit(1);
    return parseLayout(row?.layout);
  } catch {
    // The Home screen must open even if this could not be read.
    return defaultLayout();
  }
}

export async function saveDashboardLayout(userId: string, organizationId: string, raw: unknown): Promise<Layout> {
  const layout = normalizeLayout(raw);
  await db
    .insert(dashboardLayouts)
    .values({ id: `dlay_${crypto.randomUUID().replace(/-/g, "")}`, userId, organizationId, layout: serializeLayout(layout) })
    .onConflictDoUpdate({ target: [dashboardLayouts.userId, dashboardLayouts.organizationId], set: { layout: serializeLayout(layout), updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") } });
  return layout;
}
