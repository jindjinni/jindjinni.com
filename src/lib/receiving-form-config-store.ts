import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { cleanFormConfig, type ReceivingFormConfig } from "@/lib/receiving-form-config";

/** One company's Receiving Intake Form settings (the standard form when it never changed anything). */
export async function getReceivingFormConfig(organizationId: string): Promise<ReceivingFormConfig> {
  const [row] = await db.select({ c: organizations.receivingFormConfig }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return cleanFormConfig(row?.c);
}
