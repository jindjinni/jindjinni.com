import { NextRequest, NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { mailboxesOn } from "@/lib/mail-access";
import { isMailDept } from "@/lib/mail-rules";
import { getAttachmentFor } from "@/lib/mailbox-service";

export const dynamic = "force-dynamic";

// A file on a draft or a message. Only someone who may read that mailbox gets it; it is always a download, never shown inside the page.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  const dept = req.nextUrl.searchParams.get("dept");
  if (!isMailDept(dept) || !(await mailboxesOn(org.organizationId))) return new NextResponse("Not found.", { status: 404 });
  const f = await getAttachmentFor(org, dept, (await params).id);
  if (!f) return new NextResponse("Not found.", { status: 404 });
  const ascii = f.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}
