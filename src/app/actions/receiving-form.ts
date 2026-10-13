"use server";

// The Receiving Intake Form settings of one company (Receiving -> Form settings). Owner or admin only. It only changes what the form
// shows and asks for; nothing already saved on a shipment is changed or deleted.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, purchasingAuditLog } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { newId } from "@/lib/ids";
import { cleanFormConfig, serializeFormConfig } from "@/lib/receiving-form-config";

export type FormSettingsResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveReceivingFormConfig(input: unknown): Promise<FormSettingsResult> {
  const org = await requireOrg();
  if (org.viewAs) return { ok: false, error: "This is a read-only view." };
  if (!isAdmin(org.role)) return { ok: false, error: "Only an Administrator or Master Admin can change the form." };
  const cfg = cleanFormConfig(input);
  const value = serializeFormConfig(cfg);
  await db.update(organizations).set({ receivingFormConfig: value }).where(eq(organizations.id, org.organizationId));
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "receiving_form",
    recordId: org.organizationId,
    fieldName: "form_settings",
    previousValue: null,
    newValue: null,
    note: `Receiving form changed: ${cfg.hiddenPhotos.length} photo type(s) hidden, ${cfg.hiddenFields.length} question(s) hidden, ${cfg.optional.length} question(s) not required, ${cfg.hiddenPicks.length} pick-list option(s) hidden, ${Object.values(cfg.extraPicks).reduce((n, l) => n + (l?.length ?? 0), 0)} added`,
  });
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath("/dashboard/accounts", "layout");
  return { ok: true, message: value ? "Saved. The Receiving Intake Form now follows these settings for everyone in your company." : "Saved. The form is the standard form again." };
}
