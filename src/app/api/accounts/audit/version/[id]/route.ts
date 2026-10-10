import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { readVersionFile } from "@/lib/audit-service";

export const dynamic = "force-dynamic";

// A saved audit file, exactly as it was generated. Only people who can open the Audit Center, for their own company; each download is logged.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (org.viewAs) return new NextResponse("Audit files can't be downloaded while viewing as a company.", { status: 403 });
  const acc = await auditAccess(org);
  if (!acc.allowed) return new NextResponse("The Audit Center isn't available here.", { status: 403 });
  const { id } = await params;
  const f = await readVersionFile({ organizationId: org.organizationId, userId: org.userId }, id);
  if (!f) return new NextResponse("File not found.", { status: 404 });
  const name = f.fileName.replace(/[^A-Za-z0-9._ -]+/g, "_");
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
