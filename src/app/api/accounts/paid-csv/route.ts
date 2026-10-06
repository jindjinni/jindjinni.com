import { NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canViewAccounts } from "@/lib/permissions";
import { getPaidOrders } from "@/lib/accounts-queries";

export const dynamic = "force-dynamic";

const cell = (v: string | number | null) => {
  let s = v == null ? "" : String(v);
  // A cell that starts like a formula would run in a spreadsheet; keep it plain text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Every paid order as a spreadsheet file. Paid times are UTC ("Paid (UTC)") since a file has no time zone of its own.
export async function GET() {
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!canViewAccounts(org.role)) return new NextResponse("Your role can't open Accounts.", { status: 403 });
  const rows = await getPaidOrders(org.organizationId);
  const lines = [
    ["Paid (UTC)", "Customer", "Quotation", "Tracking", "Amount paid", "Receipt attached"].map(cell).join(","),
    ...rows.map((o) => [o.paidAt, o.customerName, o.quotationNumber, o.trackingNumber, o.amount.toFixed(2), o.receipts > 0 ? "Yes" : "No"].map(cell).join(",")),
  ];
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="paid-orders.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
