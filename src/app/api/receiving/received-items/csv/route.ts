import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewReceiving } from "@/lib/permissions";
import { getReceivedItems } from "@/lib/receiving-queries";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The Received Items list as a CSV (same filters as the page). Only for a signed-in member, scoped to their company.
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
  const { rows } = await getReceivedItems(org.organizationId, {
    q: p.get("q") ?? "",
    from: p.get("from") ?? "",
    to: p.get("to") ?? "",
    agentId: p.get("agent") ?? "",
    condition: p.get("condition") ?? "",
    limit: 5000,
  });
  const head = ["Line ID", "Date received", "Received by", "Package opened (UTC)", "Customer", "Order", "Tracking", "Brand", "Product", "Product code", "NDC", "Lot number", "Quantity received", "Quantity accepted", "Quantity to return", "Condition", "Expiration date", "Earliest expiration", "Latest expiration", "Accepted / return", "Return status", "Notes", "Product ID", "Package ID"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.receivedAt,
        r.receivedBy,
        r.startedAt,
        r.customer,
        r.orderNumber,
        r.trackingNumber,
        r.brand,
        r.productName,
        r.productCode,
        r.ndc,
        r.lotNumber,
        r.quantity,
        r.quantityAccepted,
        r.quantityToReturn,
        r.condition,
        r.expirationDate,
        r.expirationEarliest,
        r.expirationLatest,
        r.needsReturn === "YES" ? "Return" : r.needsReturn === "PENDING_REVIEW" ? "Pending review" : r.needsReturn === "NO" ? "Accepted" : "",
        r.returnStatus,
        r.notes,
        r.productId,
        r.packageId,
      ]
        .map(cell)
        .join(","),
    );
  }
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="received-items.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
