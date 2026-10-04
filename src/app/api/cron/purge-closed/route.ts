import { NextResponse } from "next/server";
import { purgeClosedCompanies } from "@/lib/purge";

export const dynamic = "force-dynamic";

// Nightly clean-up (see vercel.json). Vercel calls this with
// "Authorization: Bearer <CRON_SECRET>". With no CRON_SECRET configured it
// refuses every call, so nothing is ever deleted by accident.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await purgeClosedCompanies();
  return NextResponse.json(result);
}
