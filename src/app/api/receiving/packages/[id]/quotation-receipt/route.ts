import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingPackages } from "@/db/schema";
import { requireOrgApi } from "@/lib/tenant";
import { canViewReceiving } from "@/lib/permissions";
import { getReceiptForViewing, sniffReceiptType } from "@/lib/purchasing-receipt-docs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The quotation/invoice for a shipment, for Receiving staff (Receivers can't
// open Purchasing pages, so they get their own route). Looked up through the
// shipment, scoped by the member's own company.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canViewReceiving(org.role, org.access)) return new NextResponse("Your role can't open Receiving.", { status: 403 });

  const { id } = await params;
  const [pkg] = await db
    .select({ quotationId: receivingPackages.quotationId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, id), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!pkg) return new NextResponse("Shipment not found.", { status: 404 });

  const doc = await getReceiptForViewing(org, pkg.quotationId);
  if (!doc) return new NextResponse("There's no quotation receipt for this order yet.", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const safeName = doc.filename.replace(/[^A-Za-z0-9._-]/g, "_");
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
