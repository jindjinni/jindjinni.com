"use server";

// Settings -> Connectors: an owner or admin connects the company's OWN AI key (Claude or ChatGPT), checks it again or disconnects it.
// Re-checked here on the server; hiding the buttons is never the guard.

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { connectAi, disconnectAi, recheckAi } from "@/lib/ai-connection";

export type AiActionState = { error?: string; message?: string } | undefined;

async function requireAdmin(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) throw new Error("Only an owner or admin can manage the AI connection.");
  return org;
}

function refresh() {
  revalidatePath("/dashboard/settings/connectors");
  revalidatePath("/dashboard", "layout");
}

export async function connectAiAction(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const org = await requireAdmin();
  const r = await connectAi(org, String(formData.get("provider") ?? ""), String(formData.get("key") ?? ""));
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: "Connected. Label-photo reading is on and Jin has a much higher daily limit, billed to your own AI account." };
}

export async function recheckAiAction(_prev: AiActionState, _formData: FormData): Promise<AiActionState> {
  const org = await requireAdmin();
  const r = await recheckAi(org.organizationId);
  refresh();
  return r.ok ? { message: "Checked. Everything is working." } : { error: r.error };
}

export async function disconnectAiAction(_prev: AiActionState, _formData: FormData): Promise<AiActionState> {
  const org = await requireAdmin();
  await disconnectAi(org.organizationId);
  refresh();
  return { message: "Claude disconnected. Label-photo reading is off." };
}
