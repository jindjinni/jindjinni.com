import { requireOrg } from "@/lib/tenant";
import { getPaidReport } from "@/lib/accounts-queries";
import { isMonth, monthWindowUtc } from "@/lib/accounts-rules";
import { MonthlyReport } from "./monthly-report";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

// Monthly Report: everybody Accounts paid in a month (customer, the complete items, the final payout, the date paid),
// to pull at the end of the day or the end of the month. It is always one month at a time.
export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const raw = (await searchParams).month;
  const asked = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  // With no month asked for, the page opens on the current month (the browser corrects it to the viewer's own month if that differs from UTC).
  const month = isMonth(asked) ? asked : new Date().toISOString().slice(0, 7);
  const { start, end } = monthWindowUtc(month);
  const rows = await getPaidReport(org.organizationId, start, end);
  return <MonthlyReport month={month} explicit={isMonth(asked)} rows={rows} companyName={org.organizationName} />;
}
