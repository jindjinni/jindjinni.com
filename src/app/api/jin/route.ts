import { NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { cleanHistory, cleanQuestion } from "@/lib/jin-rules";
import { askJin } from "@/lib/jin-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Jin, the built-in assistant. Signed-in people only; the company and permissions come from their own membership.
export async function POST(req: Request) {
  const org = await requireOrgApi();
  if (!org) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "I didn't understand that." }, { status: 400 });
  }
  const b = (body && typeof body === "object" ? body : {}) as { question?: unknown; history?: unknown };
  const q = cleanQuestion(b.question);
  if (!q.ok) return NextResponse.json({ error: q.error }, { status: 400 });
  const reply = await askJin(org, q.text, cleanHistory(b.history));
  const headers = { "Cache-Control": "no-store" };
  if (!reply.ok) return NextResponse.json({ error: reply.error }, { status: reply.status, headers });
  return NextResponse.json({ answer: reply.answer, left: reply.left }, { headers });
}
