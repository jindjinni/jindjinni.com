"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { canRefreshIndustryNews } from "@/lib/permissions";
import { runIndustryWatch } from "@/lib/industry-service";

export type RefreshState = { ok: boolean; message: string };

/** "Refresh now" on the Home screen: looks for new recalls and news right away. */
export async function refreshIndustryNews(): Promise<RefreshState> {
  const org = await requireOrg();
  if (!canRefreshIndustryNews(org.role)) return { ok: false, message: "Only the Owner, an Admin or a Purchasing manager can refresh the news." };
  const r = await runIndustryWatch(org.organizationId, "manual");
  revalidatePath("/dashboard");
  if (r.skipped) return { ok: true, message: "A refresh is already running. Give it a minute." };
  if (r.brands === 0) return { ok: false, message: "There are no brands to watch yet. Add products under a brand in Purchasing first." };
  const found = r.added > 0 ? `Found ${r.added} new ${r.added === 1 ? "story" : "stories"}.` : "Nothing new.";
  // Some sources can fail while the rest worked: say so, but it is still a good refresh.
  if (r.problems.length > 0) return { ok: r.added > 0 || r.problems.length < r.brands, message: `${found} ${r.problems[0]}${r.problems.length > 1 ? ` (and ${r.problems.length - 1} more problem${r.problems.length > 2 ? "s" : ""})` : ""}` };
  return { ok: true, message: r.added > 0 ? found : "Checked every brand. Nothing new." };
}
