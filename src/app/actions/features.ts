"use server";

// Feature rollout controls (platform owner only, re-checked on every call).

import { eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { featureDef, isStage, setFeatureCompany, setFeatureStage, STAGE_LABELS } from "@/lib/features";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { requireOrg } from "@/lib/tenant";

export type FeatureState = { error?: string; message?: string } | undefined;

async function owner() {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformAdmin(org))) throw new Error("Not allowed.");
  return org;
}

export async function changeFeatureStage(_prev: FeatureState, formData: FormData): Promise<FeatureState> {
  const org = await owner();
  const key = String(formData.get("key") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!featureDef(key) || !isStage(stage)) return { error: "Unknown feature or stage." };
  await setFeatureStage(key, stage, org.userId);
  revalidatePath("/dashboard/settings/features");
  return { message: `${featureDef(key)!.label} is now: ${STAGE_LABELS[stage]}.` };
}

export async function addFeatureCompany(_prev: FeatureState, formData: FormData): Promise<FeatureState> {
  await owner();
  const key = String(formData.get("key") ?? "");
  const term = String(formData.get("company") ?? "").trim().slice(0, 100);
  if (!featureDef(key)) return { error: "Unknown feature." };
  if (!term) return { error: "Type a company ID (like JJ-1042), its web name, or its exact name." };
  const lower = term.toLowerCase();
  let rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(or(sql`lower(${organizations.companyCode}) = ${lower}`, sql`lower(${organizations.slug}) = ${lower}`, sql`lower(${organizations.name}) = ${lower}`));
  if (rows.length === 0) {
    const like = `%${lower.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    rows = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(sql`lower(${organizations.name}) like ${like} escape '\\'`).limit(5);
  }
  if (rows.length === 0) return { error: "No company matches that." };
  if (rows.length > 1) return { error: `More than one company matches (${rows.map((r) => r.name).join(", ")}). Use the company ID instead.` };
  await setFeatureCompany(key, rows[0].id, true);
  revalidatePath("/dashboard/settings/features");
  return { message: `Added ${rows[0].name}.` };
}

export async function removeFeatureCompany(_prev: FeatureState, formData: FormData): Promise<FeatureState> {
  await owner();
  const key = String(formData.get("key") ?? "");
  const orgId = String(formData.get("organizationId") ?? "");
  if (!featureDef(key) || !orgId) return { error: "Unknown feature." };
  const [o] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (o) await setFeatureCompany(key, orgId, false);
  revalidatePath("/dashboard/settings/features");
  return { message: "Removed." };
}
