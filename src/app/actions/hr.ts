"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { pressClock } from "@/lib/hr-service";
import type { ClockKind } from "@/lib/hr-rules";

const KINDS: ClockKind[] = ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"];

/** Anyone signed in presses their OWN clock; the person is always the signed-in user, never something the browser sends. */
export async function pressClockAction(kind: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await requireOrg();
  if (!KINDS.includes(kind as ClockKind)) return { ok: false, error: "That button isn't available." };
  const r = await pressClock({ organizationId: org.organizationId, userId: org.userId }, kind as ClockKind);
  if (r.ok) revalidatePath("/dashboard", "layout");
  return r;
}
