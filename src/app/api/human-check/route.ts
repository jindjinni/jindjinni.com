import { NextResponse } from "next/server";
import { humanCheckConfig } from "@/lib/human-check";

export const dynamic = "force-dynamic";

/** Tells the sign-in and sign-up forms whether to show the human check, and gives them the public site key (never the secret). */
export async function GET() {
  const c = humanCheckConfig();
  return NextResponse.json({ siteKey: c.siteKey, test: c.test }, { headers: { "Cache-Control": "no-store" } });
}
