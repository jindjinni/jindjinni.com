import Link from "next/link";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { parseOperationType } from "@/lib/operation-type";
import { requireOrg } from "@/lib/tenant";
import { canRefreshIndustryNews, canViewCompanyPerformance, canViewReceiving, isAdmin } from "@/lib/permissions";
import { activeRecallChecks, homeStories, isStale, lastRun, ownersOf, runIndustryWatch, watchedBrands } from "@/lib/industry-service";
import { groupNews, needsAttention } from "@/lib/industry-rules";
import { getCompanyPulse } from "@/lib/home-stats";
import { greeting, hourIn, longDay, plural } from "@/lib/home-rules";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { LocalTime } from "@/components/local-time";
import { IndustryBoard, RefreshButton } from "./industry-board";
import type { Chip } from "./home-section";
import { HomeBoard } from "./home-board";
import { getDashboardLayout } from "@/lib/dashboard-layout-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Home screen everyone lands on after signing in. It belongs to no department. It welcomes the person to the company,
// then has two closed sections: the industry news for the brands the company buys (everyone), and the company's
// performance (owner and admins only): how Purchasing, Receiving and Accounts are doing.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ viewblocked?: string }> }) {
  const org = await requireOrg();
  const blockedNote = (await searchParams).viewblocked === "1";
  const showPerformance = canViewCompanyPerformance(org.role);
  const brands = await watchedBrands(org.organizationId);
  const [stories, run, owners, checks, pulse, me, terms, layout, orgRow] = await Promise.all([
    homeStories(org.organizationId, brands),
    lastRun(org.organizationId),
    ownersOf(org.organizationId, brands),
    canViewReceiving(org.role, org.access) ? activeRecallChecks(org.organizationId) : Promise.resolve([]),
    showPerformance ? getCompanyPulse(org.organizationId) : Promise.resolve(null),
    db.select({ name: users.name }).from(users).where(eq(users.id, org.userId)).limit(1),
    getPaymentTerms(org.organizationId).catch(() => null),
    getDashboardLayout(org.userId, org.organizationId),
    isAdmin(org.role) ? db.select({ t: organizations.operationType }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1) : Promise.resolve(null),
  ]);
  // A company that signed up before the "type of operation" question was added is asked once, by its owner or an admin.
  const askOperation = !!orgRow && parseOperationType(orgRow[0]?.t) === null;

  // The news is a few hours old (or has never been fetched): look again quietly after this page is sent.
  const updating = brands.length > 0 && isStale(run);
  // (Never while a platform person is only looking at this company: nothing is written then.)
  if (updating && !org.viewAs) after(() => runIndustryWatch(org.organizationId, "auto").then(() => undefined, () => undefined));

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

  const newsContent = (
    <>
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
    </>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" data-testid="home-screen">
      {blockedNote && (
        <p role="status" className="mb-4 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900" data-testid="view-blocked-note">
          That area stays closed while you are viewing a company&apos;s account.
        </p>
      )}
      <header className="rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-800 px-5 py-4 text-white shadow-sm" data-testid="home-welcome">
        <p className="text-xs font-medium text-emerald-100 sm:text-sm">
          {greeting(hourIn(zone, now))}
          {firstName ? `, ${firstName}` : ""} · {longDay(today)}
        </p>
        <h1 className="mt-0.5 text-xl font-bold sm:text-2xl">
          Welcome to <span data-testid="home-company">{org.organizationName}</span>
        </h1>
      </header>

      {askOperation && (
        <p role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" data-testid="operation-prompt">
          <span>One quick question: is your company a wholesaler, a distributor or both? It sets up Purchasing with the right documents. Nothing you use today will change.</span>
          <Link href="/dashboard/settings/company-profile" className="rounded-md bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800">Answer now</Link>
        </p>
      )}

      <HomeBoard newsChips={newsChips} newsPreview={preview} news={newsContent} pulse={pulse} initialLayout={layout} readOnly={!!org.viewAs} />
    </div>
  );
}
