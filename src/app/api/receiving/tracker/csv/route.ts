import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewReceiving } from "@/lib/permissions";
import { getLotRegister } from "@/lib/receiving-lot-register";
import { SOURCE_LABELS, checkLabel, getSerialRegister } from "@/lib/receiving-serial-register";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The Lot & Serial Tracker as a CSV (lots or serials, same search and dates as the page), with the customer's contact details
// so a recall can be worked from a spreadsheet. Signed-in members only, scoped to their company.
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
  const view = p.get("view") === "serials" ? "serials" : "lots";
  const f = { q: p.get("q") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "", limit: 20000 };
  const lines: string[] = [];
  if (view === "lots") {
    const { rows } = await getLotRegister(org.organizationId, { ...f, recalledOnly: p.get("only") === "1" });
    lines.push(["Day received", "Date and time received", "Lot number", "Product", "NDC", "Condition", "Expiration", "Units received", "Units accepted", "Came from", "Customer email", "Customer phone", "Order", "Received by", "Recalled", "Recall", "Line ID", "Package ID"].map(cell).join(","));
    for (const r of rows) lines.push([r.day, r.receivedAt, r.lot, r.productName, r.ndc, r.condition, r.expiration, r.quantity, r.quantityAccepted, r.customer, r.customerEmail, r.customerPhone, r.orderNumber, r.receivedBy, r.recalled ? "Yes" : "", r.recallName, r.id, r.packageId].map(cell).join(","));
  } else {
    const { rows } = await getSerialRegister(org.organizationId, { ...f, flaggedOnly: p.get("only") === "1" });
    lines.push(["Day received", "Date and time received", "Serial number", "Lot number", "Product", "NDC", "Condition", "Expiration", "Came from", "Customer email", "Customer phone", "Order", "Received by", "How entered", "Check", "Check detail", "Line ID", "Package ID"].map(cell).join(","));
    for (const r of rows) {
      const c = checkLabel(r.flags);
      lines.push([r.day, r.receivedAt, r.serial, r.lot, r.productName, r.ndc, r.condition, r.expiration, r.customer, r.customerEmail, r.customerPhone, r.orderNumber, r.receivedBy, SOURCE_LABELS[r.source], c.tone === "ok" ? "OK" : c.tone === "stop" ? "Stop" : "Review", c.tone === "ok" ? "" : c.text, r.id, r.packageId].map(cell).join(","));
    }
  }
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${view === "lots" ? "lot-numbers" : "serial-numbers"}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
