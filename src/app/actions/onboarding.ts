"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { organizations, memberships, conditions } from "@/db/schema";
import { newId, defaultConditionRows } from "@/lib/ids";

/**
 * Safety-net path: a signed-in user with no organization yet (for example,
 * accepted an invite flow that isn't wired up in Phase 1). Creates the org
 * and makes them its Owner, same as sign-up does for a brand-new account.
 *
 * Invoked directly as a server component's <form action>, so it takes a
 * plain FormData -- no useActionState here, this page has no client
 * component wrapping it.
 */
export async function createOrganization(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!companyName) return;

  const orgId = newId("org");
  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || newId("org");

  await db.insert(organizations).values({ id: orgId, name: companyName, slug });
  await db.insert(memberships).values({
    id: newId("mem"),
    userId: userId!,
    organizationId: orgId,
    role: "owner",
  });
  await db.insert(conditions).values(defaultConditionRows(orgId));

  redirect("/dashboard");
}
