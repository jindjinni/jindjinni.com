import { NextRequest, NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { exchangeCode, providerBySlug, redirectUriFor, saveConnection } from "@/lib/email-connector";
import { readState } from "@/lib/email-connector-crypto";
import { isMailDept, mailPath } from "@/lib/mail-rules";
import { getMailbox, saveMailboxConnection } from "@/lib/mailbox-service";
import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SETTINGS = "/dashboard/settings/connectors";

// Step 2: the provider sends the admin back here with a one-time code. We check it is the same admin and company that
// started the sign-in, trade the code for the mailbox's address and permission, save them, and return to Email Settings.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const p = providerBySlug((await params).provider);
  if (!p) return new NextResponse("Unknown provider.", { status: 404 });
  let target = SETTINGS;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`${target}?${q}`, req.url));
    res.cookies.set("ec_nonce", "", { path: "/api/email-connect", maxAge: 0 });
    return res;
  };
  const org = await requireOrgApi();
  if (!org) return NextResponse.redirect(new URL("/login", req.url));

  const q = req.nextUrl.searchParams;
  const state = readState(q.get("state"));
  const nonce = req.cookies.get("ec_nonce")?.value;
  const stateOk = !!state && !!nonce && state.n === nonce && state.o === org.organizationId && state.u === org.userId;

  // A department mailbox: it must be the same mailbox, in the same company, that this person is allowed to connect.
  if (stateOk && state.m) {
    const [row] = await db.select({ dept: mailboxes.department }).from(mailboxes).where(and(eq(mailboxes.id, state.m), eq(mailboxes.organizationId, org.organizationId))).limit(1);
    if (!row || !isMailDept(row.dept)) return back("connect_error=state");
    target = `${mailPath(row.dept)}/settings`;
    const g = await getMailbox(org, row.dept, state.m);
    if (!g || !g.view.rights.connect) return new NextResponse("You can't connect this mailbox.", { status: 403 });
    if (q.get("error")) return back(`box=${state.m}&connect_error=denied`);
    const code = q.get("code");
    if (!code) return back(`box=${state.m}&connect_error=denied`);
    const r = await exchangeCode(p, code, redirectUriFor(req.nextUrl.origin, p));
    if (!r.ok) return back(`box=${state.m}&connect_error=${r.error}`);
    const saved = await saveMailboxConnection(org.organizationId, state.m, org.userId, { provider: p.key, email: r.email, secret: r.refreshToken, canRead: r.canRead });
    if (!saved.ok) return back(`box=${state.m}&connect_error=duplicate`);
    return back(`box=${state.m}&connected=1${r.canRead ? "" : "&no_read=1"}`);
  }

  if (!isAdmin(org.role)) return new NextResponse("Only an owner or admin can connect an email.", { status: 403 });
  if (q.get("error")) return back("connect_error=denied");
  if (!stateOk) return back("connect_error=state");
  const code = q.get("code");
  if (!code) return back("connect_error=denied");

  const r = await exchangeCode(p, code, redirectUriFor(req.nextUrl.origin, p));
  if (!r.ok) return back(`connect_error=${r.error}`);
  await saveConnection(org.organizationId, org.userId, p.key, r.email, r.refreshToken);
  return back("connected=1");
}
