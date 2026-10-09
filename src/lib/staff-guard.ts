import { notFound } from "next/navigation";
import { mayOpenSettings } from "@/lib/mothership-rules";
import { staffLevelOf } from "@/lib/platform-admin";

/** Customer support (mothership) never opens the company Settings pages other than their own account. Call at the top of such a page. */
export async function blockSupportStaff(org: { organizationId: string; userId: string; role: string }): Promise<void> {
  if (!mayOpenSettings(await staffLevelOf(org))) notFound();
}
