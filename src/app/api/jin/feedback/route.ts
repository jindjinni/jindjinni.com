import { NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { saveFeedback } from "@/lib/jin-feedback";

export const dynamic = "force-dynamic";

// "Helpful" / "Not right" on a Jin answer. Signed-in people only.
export async function POST(req: Request) {
  const org = await requireOrgApi();
  const headers = { "Cache-Control": "no-store" };
  if (!org) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "I didn't understand that." }, { status: 400, headers });
  }
  const r = await saveFeedback(org, (body && typeof body === "object" ? body : {}) as Record<string, unknown>);
  return r.ok ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: r.error }, { status: r.status, headers });
}
