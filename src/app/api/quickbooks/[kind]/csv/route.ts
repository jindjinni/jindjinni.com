import { NextResponse } from "next/server";
import { requireOrgApi } from "@/lib/tenant";
import { canSeeReport } from "@/lib/quickbooks-access";
import { latestSnapshots, quickbooksOn } from "@/lib/quickbooks-service";
import { REPORT_META, csvOf, isReportKind } from "@/lib/quickbooks-rules";

export const dynamic = "force-dynamic";

// The saved copy of one QuickBooks report as a spreadsheet file. Reads the saved copy only; it never calls QuickBooks.
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const kind = (await params).kind.toUpperCase();
  if (!isReportKind(kind)) return new NextResponse("Not found.", { status: 404 });
  const org = await requireOrgApi();
  if (!org) return new NextResponse("Sign in first.", { status: 401 });
  if (!(await quickbooksOn(org.organizationId)) || !canSeeReport(org.role, org.access, kind)) return new NextResponse("Not found.", { status: 404 });
  const snap = (await latestSnapshots(org.organizationId, [kind]))[kind];
  if (!snap) return new NextResponse("There is no saved copy of this report yet.", { status: 404 });
  const name = `quickbooks-${REPORT_META[kind].label.toLowerCase().replace(/[^a-z]+/g, "-")}.csv`;
  return new NextResponse(csvOf(snap.table), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
