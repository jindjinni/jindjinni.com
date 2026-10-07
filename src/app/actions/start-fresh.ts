"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { START_FRESH_PHRASE, runStartFresh } from "@/lib/start-fresh";

export type StartFreshState = { error?: string; done?: string } | undefined;

export async function startFresh(_prev: StartFreshState, formData: FormData): Promise<StartFreshState> {
  const org = await requireOrg();
  if (!isOwner(org.role)) return { error: "Only the owner can start fresh." };
  if (String(formData.get("phrase") ?? "").trim().toUpperCase() !== START_FRESH_PHRASE) return { error: `Type ${START_FRESH_PHRASE} exactly as shown to confirm.` };
  if (formData.get("understand") !== "on") return { error: "Tick the box to confirm you understand this can't be undone." };

  const [me] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, org.userId)).limit(1);
  const password = String(formData.get("password") ?? "");
  if (!me?.passwordHash || !password || !(await bcrypt.compare(password, me.passwordHash))) return { error: "Your password isn't right." };

  const removed = await runStartFresh(org.organizationId, org.userId);
  for (const path of ["/dashboard", "/dashboard/purchasing", "/dashboard/receiving", "/dashboard/accounts", "/dashboard/inventory", "/dashboard/settings/start-fresh"]) revalidatePath(path, "layout");
  return { done: `Done. Removed ${removed.quotations} quotations, ${removed.receivingPackages} receiving packages and ${removed.customers} customers. Your products, brands, prices and team were not touched.` };
}
