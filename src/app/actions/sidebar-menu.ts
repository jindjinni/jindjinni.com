"use server";

// Renaming and re-ordering the sidebar of a department. It changes the menu for everyone in the company, so only an
// Administrator or Master Admin can do it. Nothing here touches the pages behind the tabs.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { applyMenuEdit, isMenuDept, parseSidebarMenus } from "@/lib/sidebar-menu";

export type SidebarSaveResult = { ok: true } | { ok: false; error: string };

async function load(organizationId: string) {
  const [row] = await db.select({ sidebarMenus: organizations.sidebarMenus }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return parseSidebarMenus(row?.sidebarMenus);
}

async function store(organizationId: string, menus: object) {
  const empty = Object.keys(menus).length === 0;
  await db.update(organizations).set({ sidebarMenus: empty ? null : JSON.stringify(menus) }).where(eq(organizations.id, organizationId));
  revalidatePath("/dashboard", "layout");
}

export async function saveSidebarMenu(dept: string, input: { items: { id: string; label: string }[]; setupLabel: string }): Promise<SidebarSaveResult> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { ok: false, error: "Only an Administrator or Master Admin can change the menu." };
  if (!isMenuDept(dept)) return { ok: false, error: "That department has no menu to change." };
  if (!input || !Array.isArray(input.items) || input.items.length > 60) return { ok: false, error: "The menu could not be read. Please try again." };
  const items = input.items.map((i) => ({ id: String(i?.id ?? ""), label: String(i?.label ?? "") }));
  await store(org.organizationId, applyMenuEdit(dept, await load(org.organizationId), { items, setupLabel: String(input.setupLabel ?? "") }));
  return { ok: true };
}

/** Puts one department's menu back to the original names and order. */
export async function resetSidebarMenu(dept: string): Promise<SidebarSaveResult> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { ok: false, error: "Only an Administrator or Master Admin can change the menu." };
  if (!isMenuDept(dept)) return { ok: false, error: "That department has no menu to change." };
  const menus = await load(org.organizationId);
  delete menus[dept];
  await store(org.organizationId, menus);
  return { ok: true };
}
