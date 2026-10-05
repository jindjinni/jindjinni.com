"use server";

// Settings -> Appearance. Every department has its own light color; the company
// chooses them here. Only an owner / admin can change them.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { DEPARTMENTS, isThemeKey, type DepartmentThemes } from "@/lib/theme";

export type AppearanceState = { error?: string; message?: string } | undefined;

export async function saveDepartmentColors(_prev: AppearanceState, formData: FormData): Promise<AppearanceState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an Administrator or Master Admin can change the colors." };
  const chosen = {} as DepartmentThemes;
  for (const d of DEPARTMENTS) {
    const v = formData.get(d.key);
    if (!isThemeKey(v)) return { error: `Please pick a color for ${d.label}.` };
    chosen[d.key] = v;
  }
  await db
    .update(organizations)
    .set({ departmentThemes: JSON.stringify(chosen) })
    .where(eq(organizations.id, org.organizationId));
  revalidatePath("/dashboard", "layout");
  return { message: "Colors saved." };
}
