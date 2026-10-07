"use server";

import { unsubscribeByToken } from "@/lib/marketing-service";

/** The unsubscribe button in a marketing email. No sign-in: the signed link is the proof, and it can only unsubscribe its own address. */
export async function unsubscribeAction(token: string): Promise<{ ok: boolean }> {
  return unsubscribeByToken(String(token ?? ""));
}
