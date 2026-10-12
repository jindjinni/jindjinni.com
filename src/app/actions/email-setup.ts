"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { blockSupportStaff } from "@/lib/staff-guard";
import { isMailDept, type MailDept } from "@/lib/mail-rules";
import { saveEmailPlan } from "@/lib/email-setup-service";

export type EmailSetupState = { ok?: boolean; error?: string; field?: string; notice?: string; warnings?: string[] };

/** Saves the address typed for each department. Form fields are named `email-<department>`. */
export async function saveEmailSetupAction(_prev: EmailSetupState, formData: FormData): Promise<EmailSetupState> {
  const org = await requireOrg();
  await blockSupportStaff(org);
  const entries: { dept: MailDept; email: string }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("email-")) continue;
    const dept = k.slice(6);
    if (isMailDept(dept)) entries.push({ dept, email: String(v ?? "") });
  }
  const r = await saveEmailPlan(org, entries);
  if (!r.ok) return { error: r.error, field: r.field };
  revalidatePath("/dashboard/settings/emails");
  return { ok: true, warnings: r.warnings, notice: r.saved ? "Saved. Next, connect each address with its Connect button." : "Nothing changed." };
}
