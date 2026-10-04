import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewPurchasing } from "@/lib/permissions";
import { getReceiptForViewing, sniffReceiptType } from "@/lib/purchasing-receipt-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Serves a quotation's receipt (the app's PDF, or an attached PDF/photo/screenshot). Only to a signed-in member of the company
// that owns the quotation (the lookup is scoped by the member's own company, so
// another company's id just returns "not found"). Never a public link.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canViewPurchasing(org.role)) return new NextResponse("Your role can't open Purchasing receipts.", { status: 403 });

  const { id } = await params;
  const doc = await getReceiptForViewing(org, id);
  if (!doc) return new NextResponse("There's no receipt for this order yet.", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const safeName = doc.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  // The type comes from the file's own bytes, and only PDF + plain raster images are ever served.
  const type = sniffReceiptType(doc.bytes) ?? { mime: "application/pdf", ext: "pdf", isImage: false };
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": type.mime,
      ...(type.isImage ? { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox" } : {}),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Content-Length": String(doc.bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
