import Link from "next/link";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { canRefreshIndustryNews, canViewCompanyPerformance, canViewReceiving } from "@/lib/permissions";
import { activeRecallChecks, aiSummariesOn, homeStories, isStale, lastRun, ownersOf, runIndustryWatch, watchedBrands } from "@/lib/industry-service";
import { groupNews, needsAttention } from "@/lib/industry-rules";
import { getCompanyPulse } from "@/lib/home-stats";
import { greeting, hourIn, longDay, plural } from "@/lib/home-rules";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { LocalTime } from "@/components/local-time";
import { IndustryBoard, RefreshButton } from "./industry-board";
import { HomeSection, type Chip } from "./home-section";
import { PerformancePanel } from "./performance-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Home screen everyone lands on after signing in. It belongs to no department. It welcomes the person to the company,
// then has two closed sections: the industry news for the brands the company buys (everyone), and the company's
// performance (owner and admins only): how Purchasing, Receiving and Accounts are doing.
export default async function HomePage() {
  const org = await requireOrg();
  const showPerformance = canViewCompanyPerformance(org.role);
  const brands = await watchedBrands(org.organizationId);
  const [stories, run, owners, checks, pulse, me, terms] = await Promise.all([
    homeStories(org.organizationId, brands),
    lastRun(org.organizationId),
    ownersOf(org.organizationId, brands),
    canViewReceiving(org.role) ? activeRecallChecks(org.organizationId) : Promise.resolve([]),
    showPerformance ? getCompanyPulse(org.organizationId) : Promise.resolve(null),
    db.select({ name: users.name }).from(users).where(eq(users.id, org.userId)).limit(1),
    getPaymentTerms(org.organizationId).catch(() => null),
  ]);

  // The news is a few hours old (or has never been fetched): look again quietly after this page is sent.
  const updating = brands.length > 0 && isStale(run);
  if (updating) after(() => runIndustryWatch(org.organizationId, "auto").then(() => undefined, () => undefined));

  const now = new Date();
  const groups = groupNews(brands, stories, owners);
  const attention = needsAttention(stories, now);
  const canRefresh = canRefreshIndustryNews(org.role);

  const firstName = (me[0]?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const zone = pulse?.timeZone ?? terms?.timeZone ?? "UTC";
  const today = pulse?.today ?? now.toISOString().slice(0, 10);

  const newsChips: Chip[] = [];
  if (brands.length > 0) {
    newsChips.push(attention.length > 0 ? { text: `${plural(attention.length, "story", "stories")} need attention`, tone: "red" } : { text: "Nothing urgent", tone: "green" });
    newsChips.push({ text: plural(stories.length, "story", "stories"), tone: "slate" });
    newsChips.push({ text: plural(brands.length, "brand"), tone: "slate" });
  }
  const order = { urgent: 0, important: 1, info: 2 } as const;
  const preview = [...attention].sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 3).map((s) => s.title);

  const perfChips: Chip[] = pulse
    ? [
        { text: `${plural(pulse.periods.week.purchasing.quotesGiven, "quotation")} this week`, tone: "slate" },
        { text: `${plural(pulse.periods.week.receiving.received, "shipment")} received this week`, tone: "slate" },
        pulse.now.accounts.overdue > 0 ? { text: `${plural(pulse.now.accounts.overdue, "order")} overdue`, tone: "red" } : { text: `${plural(pulse.now.accounts.toPay, "order")} to be paid`, tone: pulse.now.accounts.toPay > 0 ? "amber" : "green" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" data-testid="home-screen">
      <header className="rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-800 px-6 py-7 text-white shadow-sm" data-testid="home-welcome">
        <p className="text-sm font-medium text-emerald-100">
          {greeting(hourIn(zone, now))}
          {firstName ? `, ${firstName}` : ""} · {longDay(today)}
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          Welcome to <span data-testid="home-company">{org.organizationName}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-50">
          {showPerformance ? "Here is the news for the brands we buy and a quick look at how the company is doing. " : "Here is the news for the brands we buy. "}
          Pick a department at the top to get to work.
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <HomeSection id="news" title="Industry news" blurb="Recalls, bad lots, safety notices and new products, straight from the makers of the brands we buy." chips={newsChips} preview={preview}>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            {brands.length > 0 ? (
              <p className="text-xs text-slate-500" data-testid="industry-status">
                Watching {plural(brands.length, "brand")}: FDA recall list and news headlines{run?.aiUsed ? ", sorted and summarised by Claude" : ""}.{" "}
                {run?.finishedAt ? (
                  <>
                    Last checked <LocalTime value={run.finishedAt} />.
                  </>
                ) : (
                  "Not checked yet."
                )}
                {updating && " Checking for news now; this page updates by itself."}
              </p>
            ) : (
              <span />
            )}
            {canRefresh && brands.length > 0 && <RefreshButton />}
          </div>

          {brands.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              No brands to watch yet. Once products are set up under a brand (Dexcom, Omnipod, FreeStyle...) in Purchasing, the news and recalls for those brands show up here.
            </p>
          ) : (
            <>
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
            <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40" data-testid="industry-checks">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Recalls Receiving is checking right now</h2>
              <p className="mt-0.5 text-xs text-slate-500">Every received box of these products is checked against the recalled lot and serial numbers.</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {checks.map((c) => (
                  <li key={c.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100">
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
        </HomeSection>

        {pulse && (
          <HomeSection id="performance" title="Company performance" blurb="How Purchasing, Receiving and Accounts are doing, at a glance." chips={perfChips}>
            <PerformancePanel pulse={pulse} />
          </HomeSection>
        )}
      </div>
    </div>
  );
}
