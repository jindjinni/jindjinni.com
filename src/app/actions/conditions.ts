"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { conditions } from "@/db/schema";
import { newId } from "@/lib/ids";

export type ActionState = { error?: string } | undefined;

export async function createCondition(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a condition name." };

  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${conditions.sortOrder}), -1)` })
    .from(conditions)
    .where(eq(conditions.organizationId, org.organizationId));

  await db.insert(conditions).values({
    id: newId("cond"),
    organizationId: org.organizationId,
    name,
    sortOrder: (row?.max ?? -1) + 1,
  });

  revalidatePath("/dashboard/settings/conditions");
}
