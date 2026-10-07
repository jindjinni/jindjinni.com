import { NextResponse } from "next/server";
import { applyWebhook, webhookTokenOk } from "@/lib/tracking-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Shippo posts here whenever a package it follows changes ("track updated"). The address carries a secret, so only
// someone who was given the address (Shippo, by the "Turn on live tracking" button) can send updates.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!webhookTokenOk(token)) return new NextResponse("Unauthorized", { status: 401 });
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  try {
    const { updated } = await applyWebhook(body);
    return NextResponse.json({ ok: true, updated });
  } catch {
    // Shippo retries a failed delivery, so a database hiccup is worth a 500.
    return new NextResponse("Error", { status: 500 });
  }
}
