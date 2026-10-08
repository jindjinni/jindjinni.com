import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { stateName } from "@/lib/business-verification";
import { DECISION_LABELS, FILTERS, companyCounts, listCompanies, parseFilter, type CompanyFilter, type CompanyStatus } from "@/lib/company-admin";
import { canCheckAutomatically, registryLink } from "@/lib/state-registry";
import { DecisionForm } from "./decision-form";
import { RegistryRecheck } from "./registry-check";

export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const BADGE: Record<CompanyStatus, { label: string; cls: string }> = {
  pending: { label: "Waiting", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  approved: { label: "Active", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  rejected: { label: "Turned down", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  suspended: { label: "Suspended", cls: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
  banned: { label: "Banned", cls: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
};

const REGISTRY_BADGE: Record<string, { label: string; cls: string }> = {
  matched: { label: "State record matches", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  check: { label: "State record: look closer", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  not_found: { label: "Not in state records", cls: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
  not_checked: { label: "Check by hand", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  error: { label: "State check failed", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
};

function href(params: { q?: string; filter?: CompanyFilter; page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.filter && params.filter !== "all") sp.set("filter", params.filter);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return `/dashboard/settings/companies${s ? `?${s}` : ""}`;
}

/** Every company on the platform: who they are, where they stand, and the buttons to approve, suspend or ban. Platform owner only. */
export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filter = parseFilter(sp.filter);
  const [counts, list] = await Promise.all([companyCounts(), listCompanies({ q, filter, page: Number(sp.page) || 1 })]);

  const stat = "rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900";
  const dl = "grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm";
  const dt = "text-slate-500 dark:text-slate-400";
  const tiles: { label: string; n: number; filter?: CompanyFilter }[] = [
    { label: "Companies", n: counts.total, filter: "all" },
    { label: "Waiting", n: counts.waiting, filter: "waiting" },
    { label: "Active", n: counts.active, filter: "active" },
    { label: "Suspended", n: counts.suspended, filter: "suspended" },
    { label: "Turned down", n: counts.turnedDown, filter: "turned_down" },
    { label: "Banned", n: counts.banned, filter: "banned" },
    { label: "New this week", n: counts.newThisWeek },
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-5" data-testid="companies">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Companies</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every company that has signed up. New ones stay locked until you approve them: check the EIN and state file number against the proof document and, if you like, your state&apos;s business search. A company that breaks our Terms and Conditions can be suspended (locked out, data kept) or banned (permanent, and its EIN can&apos;t sign up again). Only you can see this page and these documents.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="company-counts">
        {tiles.map((t) => {
          const inner = (
            <>
              <div className="text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-50" data-testid={`count-${t.label.toLowerCase().replace(/ /g, "-")}`}>{t.n}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t.label}</div>
            </>
          );
          return t.filter ? (
            <Link key={t.label} href={href({ q, filter: t.filter })} className={`${stat} hover:border-emerald-400`}>{inner}</Link>
          ) : (
            <div key={t.label} className={stat}>{inner}</div>
          );
        })}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="company-search" className="sr-only">Search companies</label>
        <input
          id="company-search"
          name="q"
          defaultValue={q}
          placeholder="Search name, EIN, or email"
          maxLength={80}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          data-testid="company-search"
        />
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900" data-testid="company-search-go">Search</button>
        {q && <Link href={href({ filter })} className="text-sm text-slate-600 underline dark:text-slate-300">Clear</Link>}
      </form>

      <nav aria-label="Filter companies" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href({ q, filter: f.key })}
            aria-current={filter === f.key ? "page" : undefined}
            data-testid={`filter-${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="company-range">
        {list.total === 0 ? "No companies match." : `Showing ${(list.page - 1) * 25 + 1}–${(list.page - 1) * 25 + list.rows.length} of ${list.total}`}
      </p>

      <div className="flex flex-col gap-2">
        {list.rows.map((c) => {
          const b = BADGE[c.status];
          return (
            <details key={c.id} className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="company-item" data-status={c.status} open={c.status === "pending"}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-slate-800 dark:text-slate-100">
                <strong className="min-w-0 break-words">{c.name}</strong>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`} data-testid="company-status">{b.label}</span>
                {c.ein && (() => { const rb = REGISTRY_BADGE[c.registryStatus ?? ""]; return rb ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rb.cls}`} data-testid="registry-badge">{rb.label}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid="registry-badge">Not checked yet</span>; })()}
                <span className="text-xs text-slate-500">
                  {c.ein ? `EIN ${c.ein}` : "Set up before approvals"}
                  {c.registeredState ? ` · ${stateName(c.registeredState)}` : ""} · signed up {day(c.createdAt)}
                </span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-slate-100 p-4 dark:border-slate-800">
                <dl className={dl}>
                  <dt className={dt}>Owner</dt><dd>{[c.ownerName, c.ownerEmail].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className={dt}>Contact</dt><dd>{[c.contactName, c.contactEmail, c.contactPhone].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className={dt}>Business email</dt><dd>{c.businessEmail || "—"}{c.website ? ` · ${c.website}` : ""}</dd>
                  <dt className={dt}>Location</dt><dd>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</dd>
                  {c.ein && (
                    <>
                      <dt className={dt}>Structure</dt><dd>{c.entityType}, formed {c.yearFormed}</dd>
                      <dt className={dt}>State file number</dt><dd>{c.stateFileNumber}</dd>
                      <dt className={dt}>State records</dt>
                      <dd data-testid="registry-detail">
                        {c.registryDetail ?? "Not checked yet."}{" "}
                        {c.registryCheckedAt && <span className="text-xs text-slate-500">({day(c.registryCheckedAt)})</span>}
                        <span className="mt-1 flex flex-wrap items-center gap-3">
                          {c.registeredState && (
                            <a href={registryLink(c.registeredState)} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline dark:text-emerald-300" data-testid="registry-link">Look it up on {stateName(c.registeredState)}&apos;s site</a>
                          )}
                          <RegistryRecheck orgId={c.id} canCheck={!!c.registeredState && canCheckAutomatically(c.registeredState)} />
                        </span>
                      </dd>
                      <dt className={dt}>Kind of business</dt><dd>{c.businessType}</dd>
                      <dt className={dt}>What they do</dt><dd>{c.businessDescription}</dd>
                      <dt className={dt}>Proof</dt>
                      <dd>
                        {c.proofType} ·{" "}
                        <a href={`/api/approvals/${c.id}/proof`} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-300" data-testid="proof-link">Open {c.proofFileName}</a>
                      </dd>
                    </>
                  )}
                  <dt className={dt}>Plan chosen</dt><dd data-testid="plan-chosen">{c.billingPlan === "monthly" ? "Monthly" : c.billingPlan === "yearly" ? "Yearly" : "None yet"} <span className="text-xs text-slate-500">(billing isn&apos;t live)</span></dd>
                  <dt className={dt}>People</dt><dd>{c.teamSize} active</dd>
                  <dt className={dt}>Last sign-in</dt><dd>{c.lastSignIn ? day(c.lastSignIn) : "Never"}</dd>
                  {(c.status === "rejected" || c.status === "suspended") && c.reason && (
                    <><dt className={dt}>Your note</dt><dd>{c.reason} <span className="text-xs text-slate-500">({day(c.decidedAt)})</span></dd></>
                  )}
                </dl>
                {c.history.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">History</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700 dark:text-slate-200" data-testid="company-history">
                      {c.history.map((h) => (
                        <li key={h.id}>
                          <span className="text-xs text-slate-500">{day(h.createdAt)}</span> · <strong>{DECISION_LABELS[h.decision] ?? h.decision}</strong>
                          {h.reason ? ` — ${h.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.id === org.organizationId ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="own-company">Your company. It can&apos;t be changed from here.</p>
                ) : (
                  <DecisionForm orgId={c.id} status={c.status} />
                )}
              </div>
            </details>
          );
        })}
      </div>

      {list.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm" data-testid="company-pager">
          {list.page > 1 ? <Link href={href({ q, filter, page: list.page - 1 })} className="text-emerald-700 underline dark:text-emerald-300" data-testid="prev-page">← Previous</Link> : <span />}
          <span className="text-slate-500">Page {list.page} of {list.pages}</span>
          {list.page < list.pages ? <Link href={href({ q, filter, page: list.page + 1 })} className="text-emerald-700 underline dark:text-emerald-300" data-testid="next-page">Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
