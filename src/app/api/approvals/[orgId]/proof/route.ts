import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessVerifications } from "@/db/schema";
import { requireOrgApi } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

/** A company's proof document. Platform owner only; never cached, never guessed from a link. */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new Response("Not signed in", { status: 401 });
  if (!(await isPlatformAdmin(org))) return new Response("Not found", { status: 404 });
  const { orgId } = await ctx.params;
  const [row] = await db
    .select({ data: businessVerifications.proofData, type: businessVerifications.proofContentType, name: businessVerifications.proofFileName })
    .from(businessVerifications)
    .where(eq(businessVerifications.organizationId, orgId))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "Content-Type": row.type,
      "Content-Disposition": `inline; filename="${row.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
