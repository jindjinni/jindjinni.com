import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { fetchMessages } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

// "Show earlier messages": the page of messages before a given message number.
export async function POST(req: NextRequest) {
  const org = await requireOrgApi();
  if (!org) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 415 });
  let b: { room?: unknown; before?: unknown } = {};
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const r = await fetchMessages({ organizationId: org.organizationId, userId: org.userId, role: org.role, access: org.access }, { room: b.room, before: typeof b.before === "number" ? b.before : null });
  return NextResponse.json(r, { status: r.ok ? 200 : 403, headers: { "Cache-Control": "no-store" } });
}
