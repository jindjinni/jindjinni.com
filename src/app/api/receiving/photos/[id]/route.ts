import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingPackagePhotos } from "@/db/schema";
import { requireOrgApi } from "@/lib/tenant";
import { canOpenReceivingFiles } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Streams one receiving photo from private storage. Only to a signed-in member
// of the company that owns it -- the lookup is scoped by the member's own
// company, so another company's id just returns "not found". Never a public link.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canOpenReceivingFiles(org.role, org.access)) return new NextResponse("Your role can't open Receiving photos.", { status: 403 });

  const { id } = await params;
  const [ph] = await db
    .select()
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.id, id), eq(receivingPackagePhotos.organizationId, org.organizationId)))
    .limit(1);
  if (!ph) return new NextResponse("Photo not found.", { status: 404 });

  const file = await storage.read(ph.storagePath);
  if (!file) return new NextResponse("Photo file not found in storage.", { status: 404 });

  const safeName = ph.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": ph.contentType,
      // Images are locked down; PDFs can't open in the browser's viewer under a sandbox, so they're served plainly (nosniff still applies).
      ...(ph.contentType.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox" } : {}),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
