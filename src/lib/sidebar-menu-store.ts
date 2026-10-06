import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { parseSidebarMenus, type SavedMenus } from "@/lib/sidebar-menu";

/** The sidebar changes a company saved (names and order), for every department. One company only. */
export async function getSavedSidebarMenus(organizationId: string): Promise<SavedMenus> {
  const [row] = await db.select({ sidebarMenus: organizations.sidebarMenus }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return parseSidebarMenus(row?.sidebarMenus);
}
