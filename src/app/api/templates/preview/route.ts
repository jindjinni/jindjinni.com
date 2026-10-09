import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewPurchasing, canViewSales } from "@/lib/permissions";
import { purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { isDocType, isTemplateDepartment } from "@/lib/document-template-rules";
import { previewPdf } from "@/lib/document-template-preview";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A sample PDF made with the signed-in company's own saved template (sample names and numbers only). Only for a signed-in member
// who can see that department; the company always comes from the session.
export async function GET(req: NextRequest) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  const department = req.nextUrl.searchParams.get("department");
  const type = req.nextUrl.searchParams.get("type");
  if (!isTemplateDepartment(department) || !isDocType(type)) return new NextResponse("Unknown template.", { status: 400 });
  const allowed = department === "purchasing" ? canViewPurchasing(org.role, org.access) : canViewSales(org.role, org.access);
  if (!allowed) return new NextResponse("Your role can't open this department.", { status: 403 });
  if (!(await purchaseOrdersEnabled(org.organizationId))) return new NextResponse("Document templates aren't turned on for your company yet.", { status: 404 });
  const pdf = await previewPdf(org.organizationId, department, type);
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
