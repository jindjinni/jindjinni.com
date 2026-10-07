import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewSales } from "@/lib/permissions";
import { getPriceSheetFile } from "@/lib/sales-service";

export const dynamic = "force-dynamic";

// The buyer's price sheet exactly as it was uploaded (Excel or CSV), for the people who can open Sales.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canViewSales(org.role, org.access)) return new NextResponse("Your role can't open Sales files.", { status: 403 });
  const { id } = await params;
  const sheet = await getPriceSheetFile(org.organizationId, id);
  if (!sheet || !sheet.fileData) return new NextResponse("Price sheet not found.", { status: 404 });
  const name = sheet.fileName.replace(/[^A-Za-z0-9._ -]+/g, "_");
  return new NextResponse(Buffer.from(sheet.fileData, "base64"), {
    headers: {
      "Content-Type": sheet.fileContentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
