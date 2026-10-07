import Link from "next/link";
import { after } from "next/server";
import { requireOrg } from "@/lib/tenant";
import { canRefreshIndustryNews, canViewReceiving } from "@/lib/permissions";
import { activeRecallChecks, aiSummariesOn, homeStories, isStale, lastRun, ownersOf, runIndustryWatch, watchedBrands } from "@/lib/industry-service";
import { groupNews, needsAttention } from "@/lib/industry-rules";
import { LocalTime } from "@/components/local-time";
import { IndustryBoard, RefreshButton } from "./industry-board";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Home screen everyone lands on after signing in. It belongs to no department: it shows what is going on in the
// industry for the brands the company buys (recalls, bad lots, safety notices, shortages, new products), by brand.
export default async function HomePage() {
  const org = await requireOrg();
  const brands = await watchedBrands(org.organizationId);
  const [stories, run, owners, checks] = await Promise.all([homeStories(org.organizationId, brands), lastRun(org.organizationId), ownersOf(org.organizationId, brands), canViewReceiving(org.role) ? activeRecallChecks(org.organizationId) : Promise.resolve([])]);

  // The news is a few hours old (or has never been fetched): look again quietly after this page is sent.
  const updating = brands.length > 0 && isStale(run);
  if (updating) after(() => runIndustryWatch(org.organizationId, "auto").then(() => undefined, () => undefined));

  const now = new Date();
  const groups = groupNews(brands, stories, owners);
  const attention = needsAttention(stories, now);
  const canRefresh = canRefreshIndustryNews(org.role);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" data-testid="home-screen">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Home</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Recalls, bad lots, safety notices and industry news for the brands we buy, so nothing catches us off guard. Pick a department at the top to get to work.
          </p>
        </div>
        {canRefresh && brands.length > 0 && <RefreshButton />}
      </div>

      {brands.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          No brands to watch yet. Once products are set up under a brand (Dexcom, Omnipod, FreeStyle...) in Purchasing, the news and recalls for those brands show up here.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-500" data-testid="industry-status">
            Watching {brands.length} {brands.length === 1 ? "brand" : "brands"}: FDA recall list and news headlines{run?.aiUsed ? ", sorted and summarised by Claude" : ""}.{" "}
            {run?.finishedAt ? (
              <>
                Last checked <LocalTime value={run.finishedAt} />.
              </>
            ) : (
              "Not checked yet."
            )}
            {updating && " Checking for news now; this page updates by itself."}
          </p>
          {run && run.problems.length > 0 && (
            <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="industry-problems">
              Some sources didn&apos;t answer the last time: {run.problems.slice(0, 3).join(" ")}
              {run.problems.length > 3 ? ` (and ${run.problems.length - 3} more)` : ""} It will try again.
            </p>
          )}
          {!aiSummariesOn() && canRefresh && <p className="mt-1 text-xs text-slate-500">Headlines are sorted by keywords. Add the ANTHROPIC_API_KEY setting to have Claude check and summarise each one.</p>}
          <IndustryBoard groups={groups} attention={attention} nowIso={now.toISOString()} updating={updating} />
        </>
      )}

      {checks.length > 0 && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900" data-testid="industry-checks">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Recalls Receiving is checking right now</h2>
          <p className="mt-0.5 text-xs text-slate-500">Every received box of these products is checked against the recalled lot and serial numbers.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {checks.map((c) => (
              <li key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                {c.noticeUrl ? (
                  <a href={c.noticeUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
                {c.manufacturer ? ` · ${c.manufacturer}` : ""}
              </li>
            ))}
          </ul>
          <Link href="/dashboard/receiving" className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Open Receiving
          </Link>
        </section>
      )}
    </div>
  );
}
