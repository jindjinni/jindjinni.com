import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { attachmentForViewer } from "@/lib/chat-service";
import { storage } from "@/lib/receiving-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Streams one shared chat file from private storage, only to someone who may read the room it was sent in. Never a public link.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  const { id } = await params;
  const a = await attachmentForViewer({ organizationId: org.organizationId, userId: org.userId, role: org.role }, id);
  if (!a) return new NextResponse("File not found.", { status: 404 });
  if (!storage.configured()) return new NextResponse("File storage isn't connected.", { status: 503 });
  let file: Awaited<ReturnType<typeof storage.read>> = null;
  try {
    file = await storage.read(a.storagePath);
  } catch {
    file = null;
  }
  if (!file) return new NextResponse("File not found in storage.", { status: 404 });
  const safeName = a.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const image = a.contentType.startsWith("image/");
  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": a.contentType,
      // Photos show in the chat; everything else downloads, and nothing in a shared file can run as a page.
      ...(image ? { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox" } : {}),
      "Content-Disposition": `${image ? "inline" : "attachment"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
