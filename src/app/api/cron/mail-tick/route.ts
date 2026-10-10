import { NextResponse } from "next/server";
import { dispatchDue } from "@/lib/mailbox-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sends the scheduled emails that have come due, for every company. Same protection as the other cron routes: "Authorization: Bearer
// <CRON_SECRET>" (with no CRON_SECRET it refuses everything). The hosting plan only runs scheduled jobs once a day (see vercel.json), so
// this is the daily safety net; for on-the-minute delivery point a free "ping every minute" service at this address with the same
// header (see docs/FOUNDATION.md, Department mailboxes). While anyone has the Mail tab open, the tab also sends what is due.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await dispatchDue({ limit: 100 }));
}
