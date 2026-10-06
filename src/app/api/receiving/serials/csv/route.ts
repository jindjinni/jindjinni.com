import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewReceiving } from "@/lib/permissions";
import { SOURCE_LABELS, checkLabel, getSerialRegister } from "@/lib/receiving-serial-register";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The Serial Numbers register as a CSV (same filters as the page). Signed-in members only, scoped to their company.
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // a spreadsheet must never run a cell as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canViewReceiving(org.role)) return new NextResponse("Your role can't open Receiving.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const { rows } = await getSerialRegister(org.organizationId, { q: p.get("q") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "", flaggedOnly: p.get("flagged") === "1", limit: 20000 });
  const head = ["Day received", "Date and time received", "Serial number", "Lot number", "Product", "NDC", "Condition", "Expiration", "Order", "Customer", "Received by", "How entered", "Check", "Check detail", "Line ID", "Package ID"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    const c = checkLabel(r.flags);
    lines.push([r.day, r.receivedAt, r.serial, r.lot, r.productName, r.ndc, r.condition, r.expiration, r.orderNumber, r.customer, r.receivedBy, SOURCE_LABELS[r.source], c.tone === "ok" ? "OK" : c.tone === "stop" ? "Stop" : "Review", c.tone === "ok" ? "" : c.text, r.id, r.packageId].map(cell).join(","));
  }
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="serial-numbers.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
