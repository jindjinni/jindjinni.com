// Ends a "view as company" look: clears the cookie, marks the session ended, and returns to the ticket. A plain link (GET) on
// purpose -- while looking, every other kind of request is blocked, and ending must always work.

import { NextResponse, type NextRequest } from "next/server";
import { endViewSession } from "@/lib/support-service";
import { auth } from "@/lib/auth";
import { VIEW_COOKIE, readViewToken } from "@/lib/view-as-token";
import { db } from "@/db/client";
import { supportViewSessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.cookies.get(VIEW_COOKIE)?.value;
  const token = readViewToken(raw);
  let back = "/dashboard";
  if (token) {
    const session = await auth();
    const uid = (session?.user as { id?: string } | undefined)?.id;
    if (uid && uid === token.u) {
      const [s] = await db.select({ ticketId: supportViewSessions.ticketId }).from(supportViewSessions).where(eq(supportViewSessions.id, token.s)).limit(1);
      if (s) back = `/dashboard/mothership/support/${s.ticketId}`;
      await endViewSession(token.s);
    }
  }
  const res = NextResponse.redirect(new URL(back, req.url));
  res.cookies.set(VIEW_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
