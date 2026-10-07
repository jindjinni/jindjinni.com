import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canOpenReceivingFiles } from "@/lib/permissions";
import { renderAdjustmentPdf } from "@/lib/receiving-adjustment-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The adjusted quotation as a PDF, built from the saved lines each time it's opened (so a draft always shows
// what's on screen). Only for a signed-in member of the company that owns it; another company's id is "not found".
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canOpenReceivingFiles(org.role, org.access)) return new NextResponse("Your role can't open Receiving documents.", { status: 403 });
  const { id } = await params;
  const pdf = await renderAdjustmentPdf(org.organizationId, org.organizationName, id);
  if (!pdf) return new NextResponse("Adjustment not found.", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
