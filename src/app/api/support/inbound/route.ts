// Mail sent to support@ lands here (set up in the email service: see docs/FOUNDATION.md, "Support center"). Closed unless
// SUPPORT_INBOUND_SECRET is set. Every request is authenticated, size-capped and rate-limited before anything is saved.

import { NextResponse, type NextRequest } from "next/server";
import { rateHit } from "@/lib/rate-limit";
import { MAX_INBOUND_BYTES, htmlToText, normalizeInbound, sharedSecretOk, splitFrom, verifySvix } from "@/lib/support-inbound";
import { receiveSupportEmail } from "@/lib/support-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = process.env.SUPPORT_INBOUND_SECRET;
  if (!secret) return NextResponse.json({ error: "Email-in is not set up." }, { status: 503 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_INBOUND_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_INBOUND_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });

  const svix = req.headers.get("svix-signature");
  const authentic = svix
    ? secret.startsWith("whsec_") && verifySvix(secret, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: svix }, raw)
    : sharedSecretOk(secret, { header: req.headers.get("x-support-secret"), authorization: req.headers.get("authorization"), query: req.nextUrl.searchParams.get("secret") });
  if (!authentic) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const all = await rateHit("support-inbound", "all", 600, 3600);
  if (!all.allowed) return NextResponse.json({ error: "Slow down." }, { status: 429 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  let norm = normalizeInbound(payload);
  if (!norm) return NextResponse.json({ error: "Nothing to read." }, { status: 400 });

  if (norm.kind === "fetch") {
    // Resend sends only the details; the body comes from its Received emails API.
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ error: "Cannot read the email body: no email service key." }, { status: 500 });
    const base = process.env.RESEND_API_BASE || "https://api.resend.com";
    try {
      const res = await fetch(`${base}/emails/receiving/${encodeURIComponent(norm.emailId)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
      if (!res.ok) return NextResponse.json({ error: "Could not fetch the email." }, { status: 502 });
      const d = (await res.json()) as { text?: string | null; html?: string | null; headers?: { from?: string } };
      const text = d.text || (d.html ? htmlToText(d.html) : "");
      const f = splitFrom(d.headers?.from || norm.from);
      norm = { kind: "mail", mail: { from: f.address, fromName: f.name, subject: norm.subject, text, messageId: norm.messageId } };
    } catch {
      return NextResponse.json({ error: "Could not fetch the email." }, { status: 502 });
    }
  }
  if (norm.kind !== "mail") return NextResponse.json({ error: "Nothing to read." }, { status: 400 });

  const sender = await rateHit("support-inbound-sender", norm.mail.from.toLowerCase(), 30, 3600);
  if (!sender.allowed) return NextResponse.json({ ok: true, ignored: "rate" }, { status: 200 });

  const result = await receiveSupportEmail(norm.mail);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  return NextResponse.json({ ok: true, ticketNo: result.ticketNo, created: result.created, duplicate: result.duplicate ?? false });
}
