import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewSales } from "@/lib/permissions";
import { renderPdf } from "@/lib/sales-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A Sales quotation or invoice as a PDF, built from what is saved each time it is opened. Only for a signed-in member of
// the company that owns it; another company's id is "not found". ?download=1 saves the file instead of showing it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canViewSales(org.role, org.access)) return new NextResponse("Your role can't open Sales documents.", { status: 403 });
  const { id } = await params;
  const pdf = await renderPdf(org.organizationId, id);
  if (!pdf) return new NextResponse("Document not found.", { status: 404 });
  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
