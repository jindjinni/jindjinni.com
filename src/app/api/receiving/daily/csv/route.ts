import { NextResponse, type NextRequest } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewReceiving } from "@/lib/permissions";
import { getReceivedItems } from "@/lib/receiving-queries";
import { HELD_LABELS, groupDaily } from "@/lib/receiving-daily";
import { getSerialsByItem } from "@/lib/receiving-serial-register";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The Daily Receiving summary as a CSV: one row per day / product / NDC / condition / lot / expiration, then the held-back
// lines marked as such. Same dates and search as the page. Signed-in members only, scoped to their company.
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
  const { rows } = await getReceivedItems(org.organizationId, { q: p.get("q") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "", limit: 5000 });
  const days = groupDaily(rows, await getSerialsByItem(org.organizationId, rows.map((r) => r.sourceItemId ?? "")));
  const head = ["Day", "Status", "Product", "Brand", "Product code", "NDC", "Condition", "Lot number", "Serial numbers", "Expiration", "Quantity received", "Quantity returned", "Quantity accepted", "Packages", "Note"];
  const lines = [head.map(cell).join(",")];
  for (const d of days) {
    for (const g of d.groups) lines.push([d.day, "Stock", g.productName, g.brand, g.productCode, g.ndc, g.condition, g.lot, g.serials.map((s) => s.serial).join("; "), g.expiration, g.received, g.returned, g.accepted, g.packages, ""].map(cell).join(","));
    for (const h of d.held) lines.push([d.day, "Held back", h.productName, "", "", h.ndc, h.condition, h.lot, "", h.expiration, h.quantity, "", 0, 1, [HELD_LABELS[h.reason], h.detail].filter(Boolean).join(": ")].map(cell).join(","));
  }
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="daily-receiving.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
