import { NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { summary } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

// The top bar asks this on every page: how many unread messages, and what was the newest. It also counts as "this person is online".
export async function GET() {
  const org = await requireOrgApi();
  if (!org) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const s = await summary({ organizationId: org.organizationId, userId: org.userId, role: org.role, access: org.access }, Date.now());
  return NextResponse.json({ ok: true, ...s }, { headers: { "Cache-Control": "no-store" } });
}
