import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, purchasingAuditLog } from "@/db/schema";
import { getSessionUserId } from "@/lib/tenant";
import { isAdmin, isOwner } from "@/lib/permissions";
import { buildCompanyWorkbook } from "@/lib/company-export";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

// "Download my data" -- owners and admins, including the owner of a company
// that was just closed (that's when they most need it).
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse("Sign in first.", { status: 401 });

  const [row] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      closedAt: organizations.closedAt,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt)))
    .limit(1);

  if (!row) return new NextResponse("No company found.", { status: 403 });
  // Admins can export while the company is open; only the owner once it is closed.
  const allowed = row.closedAt ? isOwner(row.role) : isAdmin(row.role);
  if (!allowed) return new NextResponse("Only an owner or admin can download company data.", { status: 403 });

  const file = await buildCompanyWorkbook(row.organizationId, row.organizationName);
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: row.organizationId,
    userId,
    recordType: "company",
    recordId: row.organizationId,
    fieldName: "export",
    previousValue: null,
    newValue: null,
    note: "Company data downloaded",
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = row.organizationName.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase() || "company";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-data-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
