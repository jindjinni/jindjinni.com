import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewShipping } from "@/lib/permissions";
import { getFileForOrg, shippingOn } from "@/lib/shipping-service";
import { storage } from "@/lib/receiving-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Streams one shipping photo or document from private storage. Only to a signed-in member of the company that owns it (the lookup is
// scoped by the member's own company, so another company's id just returns "not found"). Never a public link.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!(await shippingOn(org.organizationId))) return new NextResponse("Not found.", { status: 404 });
  if (!canViewShipping(org.role, org.access)) return new NextResponse("Your role can't open Shipping files.", { status: 403 });

  const { id } = await params;
  const f = await getFileForOrg(org.organizationId, id);
  if (!f) return new NextResponse("File not found.", { status: 404 });
  const file = await storage.read(f.storagePath);
  if (!file) return new NextResponse("File not found in storage.", { status: 404 });

  const safeName = f.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": f.contentType,
      ...(f.contentType.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox" } : {}),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
