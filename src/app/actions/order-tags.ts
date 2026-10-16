"use server";

// Small tags on an order that tell the whole team what has already been done (feature `order-tags`).
//   - "Email sent" is automatic: Customer Service's Send stamps the order (customerNotifiedAt), nothing to do here.
//   - "Contacted on Facebook" is ticked by a person who messaged the customer through Facebook Business Manager.
// Ticking and unticking are written to the order's history, so who did it and when is never lost.

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingPackages } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { canSendCustomerEmails, canWriteAccounts } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { auditReceiving } from "@/lib/receiving-service";
import { orderTagInfo, type OrderTagInfo } from "@/lib/customer-service-queries";

export type TagState = { ok?: boolean; error?: string; tags?: OrderTagInfo };

/** Accounts and Customer Service people (and Admins / the Owner) may tick it; everyone else only sees it. */
export async function setFacebookContacted(packageId: string, on: boolean): Promise<TagState> {
  const org = await requireOrg();
  if (!(await featureOn("order-tags", org.organizationId))) return { error: "The order tags aren't switched on for your company yet." };
  if (!canWriteAccounts(org.role, org.access) && !canSendCustomerEmails(org.role, org.access)) return { error: "Your role can see this tag but can't change it." };
  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That order wasn't found." };
  if (p.status === "IN_PROGRESS") return { error: "Receiving hasn't submitted this order yet." };
  if (on === !!p.facebookContactedAt) return { ok: true, tags: await orderTagInfo(p) };

  await db
    .update(receivingPackages)
    .set(
      on
        ? { facebookContactedAt: sql`(current_timestamp)`, facebookContactedByUserId: org.userId, updatedAt: sql`(current_timestamp)` }
        : { facebookContactedAt: null, facebookContactedByUserId: null, updatedAt: sql`(current_timestamp)` },
    )
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)));
  await auditReceiving(org, p.quotationId, "order-tags", on ? "Tagged: customer contacted on Facebook" : "Facebook contacted tag removed");
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/customer-service", "layout");
  revalidatePath("/dashboard/receiving", "layout");
  const [fresh] = await db.select().from(receivingPackages).where(eq(receivingPackages.id, packageId)).limit(1);
  return { ok: true, tags: await orderTagInfo(fresh) };
}
