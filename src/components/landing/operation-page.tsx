import Link from "next/link";
import { Icon } from "@/components/landing/icons";
import { SafetySection, SiteFooter, SiteHeader, Eyebrow, btnPrimary, btnSecondary } from "@/components/landing/site-shell";
import { BOTH_POINTS, DISTRIBUTION, WHOLESALE, type DeptBlock, type OperationContent, type OperationSlug } from "@/lib/landing-content";

const SWITCH: { slug: OperationSlug; label: string }[] = [
  { slug: "wholesale", label: "Wholesale" },
  { slug: "distribution", label: "Distribution" },
  { slug: "both", label: "Both together" },
];

function Switcher({ current }: { current: OperationSlug }) {
  return (
    <nav aria-label="Choose how you work" className="mt-8 flex flex-wrap gap-2">
      {SWITCH.map((s) => (
        <Link
          key={s.slug}
          href={`/${s.slug}`}
          aria-current={s.slug === current ? "page" : undefined}
          data-testid={`switch-${s.slug}`}
          className={`rounded-full border px-5 py-2 text-sm font-bold transition ${
            s.slug === current ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

function DeptCard({ d }: { d: DeptBlock }) {
  return (
    <article className="rounded-3xl border border-line bg-white p-6" data-testid="dept-card">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint text-brand-deep">
          <Icon name={d.icon} className="h-6 w-6" />
        </span>
        <h3 className="text-lg font-extrabold tracking-tight">{d.dept}</h3>
      </div>
      <p className="mt-3 text-[15px] font-semibold leading-relaxed text-ink">{d.line}</p>
      <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted">
        {d.points.map((p) => (
          <li key={p} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {p}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Day({ c }: { c: OperationContent }) {
  return (
    <section className="bg-slate-50 py-16 sm:py-20" data-testid="op-day">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>{c.slug === "both" ? "How it fits together" : "A day in this operation"}</Eyebrow>
        <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          {c.slug === "both" ? "Two ways of working, one sign-in." : "How the work flows, start to finish."}
        </h2>
        {/* A real sequence: order matters, so it is numbered. */}
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {c.day.map((s, i) => (
            <li key={s} className="flex gap-4 rounded-3xl border border-line bg-white p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-ink">{i + 1}</span>
              <p className="text-[15px] font-semibold leading-snug text-ink">{s}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Wholesale or Distribution: every department and what it does for that side. */
function SingleSide({ c }: { c: OperationContent }) {
  return (
    <section className="bg-white py-16 sm:py-24" data-testid="op-depts">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>Department by department</Eyebrow>
        <h2 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">What {c.name} gets in every department.</h2>
        <p className="mt-4 max-w-3xl text-lg text-muted">
          Every department shares the same customers, products, orders and people, so you enter things once and everyone sees them.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {c.depts.map((d) => (
            <DeptCard key={d.dept} d={d} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Both: the two sides next to each other, department by department. */
function Together() {
  const dists = new Map(DISTRIBUTION.depts.map((d) => [d.dept, d]));
  return (
    <section className="bg-white py-16 sm:py-24" data-testid="op-depts">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>Everything from both sides</Eyebrow>
        <h2 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">
          All the benefits of Wholesale and all the benefits of Distribution.
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-muted">
          Each department below shows what the Wholesale side gets and what the Distribution side gets. You pick the side you are working in, and the menus change to match.
        </p>
        <div className="mt-10 flex flex-col gap-6">
          {WHOLESALE.depts.map((w) => {
            const d = dists.get(w.dept) ?? w;
            return (
              <div key={w.dept} className="rounded-[2rem] border border-line bg-slate-50 p-4 sm:p-6" data-testid="together-row">
                <h3 className="flex items-center gap-3 px-2 text-xl font-extrabold tracking-tight">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint text-brand-deep">
                    <Icon name={w.icon} className="h-5 w-5" />
                  </span>
                  {w.dept}
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-line bg-white p-5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-brand-deep">Wholesale side</p>
                    <p className="mt-2 text-[15px] font-semibold text-ink">{w.line}</p>
                    <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted">
                      {w.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-line bg-white p-5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-brand-deep">Distribution side</p>
                    <p className="mt-2 text-[15px] font-semibold text-ink">{d.line}</p>
                    <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted">
                      {d.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-16">
          <Eyebrow>What changes when you run both</Eyebrow>
          <h2 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">Separate where it matters. Together where it helps.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="both-points">
            {BOTH_POINTS.map((b) => (
              <article key={b.title} className="rounded-3xl border border-line bg-white p-6">
                <h3 className="text-lg font-extrabold tracking-tight">{b.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{b.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function OperationPage({ content, priceNote }: { content: OperationContent; priceNote?: string }) {
  const c = content;
  return (
    <div className="min-h-full overflow-x-clip bg-white text-ink" data-testid={`op-page-${c.slug}`}>
      <SiteHeader />
      <main>
        <section className="relative bg-[radial-gradient(60%_55%_at_85%_0%,#d4f7e3_0%,transparent_70%)]">
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
            <Eyebrow>{c.name}</Eyebrow>
            <h1 className="mt-3 max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">{c.tagline}</h1>
            <p className="mt-6 max-w-3xl text-lg text-muted">{c.intro}</p>
            <p className="mt-3 max-w-3xl text-base font-bold text-ink">{c.forWhom}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={btnPrimary}>
                Get Started
                <Icon name="arrow" className="h-5 w-5" />
              </Link>
              <Link href="/#pricing" className={btnSecondary}>See pricing</Link>
            </div>
            {priceNote && <p className="mt-4 max-w-2xl text-sm font-semibold text-muted" data-testid="op-price-note">{priceNote}</p>}
            <Switcher current={c.slug} />
          </div>
        </section>

        <Day c={c} />
        {c.slug === "both" ? <Together /> : <SingleSide c={c} />}
        <SafetySection />

        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl rounded-[2.5rem] bg-brand px-6 py-14 text-center sm:px-12 sm:py-20">
            <h2 className="mx-auto max-w-3xl text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Ready to run {c.slug === "both" ? "both sides" : c.name} from one place?
            </h2>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-8 py-4 text-base font-bold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                Get Started
                <Icon name="arrow" className="h-5 w-5" />
              </Link>
              <p className="text-base font-semibold text-ink/80">
                Already have an account? <Link href="/login" className="font-extrabold text-ink underline decoration-2 underline-offset-4">Sign In</Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
