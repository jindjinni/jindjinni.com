"use server";

// Renaming and re-ordering the sidebar of a department. It changes the menu for everyone in the company, so only an
// Administrator or Master Admin can do it. Nothing here touches the pages behind the tabs.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { applyMenuEdit, applyTopEdit, isMenuDept, parseSidebarMenus } from "@/lib/sidebar-menu";

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

export async function saveSidebarMenu(dept: string, input: { items: { id: string; label: string; hidden?: boolean }[]; setupLabel: string }): Promise<SidebarSaveResult> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { ok: false, error: "Only an Administrator or Master Admin can change the menu." };
  if (!isMenuDept(dept)) return { ok: false, error: "That department has no menu to change." };
  if (!input || !Array.isArray(input.items) || input.items.length > 60) return { ok: false, error: "The menu could not be read. Please try again." };
  const items = input.items.map((i) => ({ id: String(i?.id ?? ""), label: String(i?.label ?? ""), hidden: i?.hidden === true }));
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

/** Saves the top bar (the links across the top of every page): their order, names, and which are hidden. Home, Lamp and Settings can't be hidden or renamed. */
export async function saveTopBar(input: { items: { id: string; label: string; hidden: boolean }[] }): Promise<SidebarSaveResult> {
  const org = await requireOrg();
  if (org.viewAs) return { ok: false, error: "This is a read-only view." };
  if (!isAdmin(org.role)) return { ok: false, error: "Only an Administrator or Master Admin can change the top bar." };
  if (!input || !Array.isArray(input.items) || input.items.length > 30) return { ok: false, error: "The top bar could not be read. Please try again." };
  const items = input.items.map((i) => ({ id: String(i?.id ?? ""), label: String(i?.label ?? ""), hidden: i?.hidden === true }));
  await store(org.organizationId, applyTopEdit(await load(org.organizationId), { items }));
  return { ok: true };
}

/** Puts the top bar back to the original names and order, with nothing hidden. */
export async function resetTopBar(): Promise<SidebarSaveResult> {
  const org = await requireOrg();
  if (org.viewAs) return { ok: false, error: "This is a read-only view." };
  if (!isAdmin(org.role)) return { ok: false, error: "Only an Administrator or Master Admin can change the top bar." };
  const menus = await load(org.organizationId);
  delete menus.top;
  await store(org.organizationId, menus);
  return { ok: true };
}
