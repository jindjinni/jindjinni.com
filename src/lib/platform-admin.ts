// The platform owner: the Owner of a company the platform runs itself (the same list as PLATFORM slugs used for the
// platform's own Shippo account). Only they can open Jin's library and read Jin feedback. Always re-checked on the server.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { isOwner } from "@/lib/permissions";
import { mayUsePlatformShippo } from "@/lib/shippo-connection";

export async function isPlatformAdmin(org: { organizationId: string; role: string }): Promise<boolean> {
  if (!isOwner(org.role)) return false;
  const [row] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);
  return !!row && mayUsePlatformShippo(row.slug);
}
