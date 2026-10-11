import Link from "next/link";
import { usd } from "@/lib/billing-config";
import { currentBook } from "@/lib/pricing-service";
import { monthlyPrice, yearlyPrice, yearlyRegular, yearlySavings } from "@/lib/pricing-rules";

// The prices on this page are the newest ones set in the Lamp; saving a new price refreshes the page at once, and it also refreshes by itself every minute.
export const revalidate = 60;
import { TRIAL_DAYS } from "@/lib/billing-schedule";
import { signupHref } from "@/lib/operation-type";
import { CANCEL_COMEBACK_TEXT, CANCEL_MONTHLY_TEXT, CANCEL_TRIAL_TEXT, CANCEL_YEARLY_TEXT } from "@/lib/cancellation-copy";
import { Icon, LogoMark, Sparkle, type IconName } from "@/components/landing/icons";
import { AffiliateProgramSection, AudienceSection, DirectSourcingSection, Eyebrow, SafetySection, SiteFooter, SiteHeader, btnPrimary, btnSecondary } from "@/components/landing/site-shell";
import { affiliateExample } from "@/lib/affiliate-program";
import { affiliateCut } from "@/lib/pricing-rules";
import { AUDIENCES, BOTH, DISTRIBUTION, HOW_SECTION, WHOLESALE } from "@/lib/landing-content";
import { HeroDashboard } from "@/components/landing/mocks";

const departments: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "purchasing",
    title: "Purchasing",
    body: "Where every order begins.",
  },
  {
    icon: "receiving",
    title: "Receiving",
    body: "Where every item is checked.",
  },
  {
    icon: "accounts",
    title: "Accounts",
    body: "Where the money stays straight.",
  },
  {
    icon: "support",
    title: "Customer Service",
    body: "Where customers are looked after.",
  },
  {
    icon: "inventory",
    title: "Inventory",
    body: "Always know what you hold.",
  },
  {
    icon: "tag",
    title: "Sales",
    body: "Where orders become invoices.",
  },
  {
    icon: "distribution",
    title: "Shipping",
    body: "Get it out the door.",
  },
  {
    icon: "megaphone",
    title: "Marketing",
    body: "Stay in touch with your contacts.",
  },
  {
    icon: "clock",
    title: "HR",
    body: "Your team's time, in one place.",
  },
  {
    icon: "chat",
    title: "Company Chat",
    body: "Your team, together.",
  },
];

const stats: { value: string; label: string }[] = [
  { value: "10", label: "connected departments" },
  { value: "1", label: "shared record for every order" },
  { value: "100", label: "team members per company, built for growing businesses" },
  { value: "Private", label: "workspace for every company" },
];

const trustPoints = [
  { icon: "lock" as IconName, title: "Every company is walled off", body: "Your records belong to your company alone." },
  { icon: "team" as IconName, title: "Role-based access", body: "People see only what their role allows." },
  { icon: "shield" as IconName, title: "An audit trail", body: "Important changes are recorded." },
  { icon: "building" as IconName, title: "Your data, your exit", body: "Take your records with you at any time." },
];

const stack = ["Purchasing", "Receiving", "Accounts", "Customer Service", "Inventory", "Sales", "Shipping", "Marketing", "HR", "Chat"];

export default async function Home() {
  const book = await currentBook();
  const MONTHLY_CENTS = monthlyPrice(book, 1);
  const YEARLY_CENTS = yearlyPrice(book, 1);
  const YEARLY_REGULAR_CENTS = yearlyRegular(book, 1);
  const YEARLY_SAVINGS_CENTS = yearlySavings(book, 1);
  return (
    <div className="min-h-full overflow-x-clip bg-white text-ink">
      <SiteHeader />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative bg-[radial-gradient(60%_55%_at_85%_0%,#d4f7e3_0%,transparent_70%)]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10 lg:pb-28 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-mint px-3.5 py-1.5 text-xs font-bold text-brand-deep ring-1 ring-inset ring-mint-line">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Premium enterprise software
              </p>
              <h1 className="relative mt-6 text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                Your Entire Business,{" "}
                <span className="rounded-2xl bg-brand px-3 [box-decoration-break:clone]">One Platform</span>
                <Sparkle className="absolute -right-2 -top-6 hidden h-8 w-8 sm:block" />
                <Sparkle className="absolute right-10 top-0 hidden h-4 w-4 sm:block" />
              </h1>
              <p className="mt-6 text-lg font-bold text-ink sm:text-xl">
                Purchasing. Receiving. Accounts. Customer Service. Inventory. Sales. Shipping. Marketing. HR. Chat.
              </p>
              <p className="mt-4 max-w-xl text-lg text-muted">
                jindjinni is enterprise software for companies that buy and sell medical supplies. Every department on one connected record, with safety checks built in. Enter it once, and everyone sees it.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/signup" className={btnPrimary}>
                  Get Started
                  <Icon name="arrow" className="h-5 w-5" />
                </Link>
                <Link href="/login" className={btnSecondary}>
                  Sign In
                </Link>
              </div>
              <p className="mt-5 text-sm font-bold text-ink" data-testid="hero-sides">
                See how it works for{" "}
                <Link href="/wholesale" className="underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink">Wholesale</Link>,{" "}
                <Link href="/distribution" className="underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink">Distribution</Link> or{" "}
                <Link href="/both" className="underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink">both together</Link>.
              </p>
              <p className="mt-3 max-w-xl text-sm font-semibold text-muted" data-testid="active-only">
                For active businesses only. Your company must be active and in good standing with its state&rsquo;s Secretary of State. We check, and an inactive company can be suspended until it is active again.
              </p>
            </div>
            <HeroDashboard />
          </div>
        </section>

        {/* ---------- Numbers ---------- */}
        <section className="border-y border-line bg-slate-50">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
            {stats.map((x) => (
              <div key={x.label} className="text-center">
                <dt className="text-3xl font-extrabold tracking-tight text-ink tabular-nums sm:text-4xl">{x.value}</dt>
                <dd className="mt-1 px-2 text-sm font-semibold text-muted">{x.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------- How you work: Wholesale, Distribution, Both ---------- */}
        <section id="how" className="scroll-mt-20 bg-white py-20 sm:py-28" data-testid="how-section">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Eyebrow>{HOW_SECTION.eyebrow}</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">{HOW_SECTION.title}</h2>
              <p className="mt-5 text-lg text-muted">{HOW_SECTION.body}</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[WHOLESALE, DISTRIBUTION, BOTH].map((c) => (
                <Link
                  key={c.slug}
                  href={`/${c.slug}`}
                  data-testid={`how-card-${c.slug}`}
                  className="group flex flex-col rounded-3xl border border-line bg-white p-7 transition motion-safe:hover:-translate-y-1 hover:border-brand hover:shadow-[0_24px_50px_-28px_rgba(10,122,58,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <h3 className="text-2xl font-extrabold tracking-tight">{c.name}</h3>
                  <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{c.tagline}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-[15px] leading-relaxed text-muted">
                    {c.cardPoints.map((p) => (
                      <li key={p} className="flex items-start gap-2.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-ink">
                    See every department
                    <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <DirectSourcingSection id="direct-sourcing" />

        <AudienceSection items={AUDIENCES} />

        {/* ---------- Every department ---------- */}
        <section id="platform" className="scroll-mt-20 bg-white py-20 sm:py-28" data-testid="departments">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Eyebrow>Every department, built in</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                One platform for every department.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Each department has its own workspace and they all share one record. Your team opens only what their job needs.
              </p>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <article
                  key={d.title}
                  className="group rounded-3xl border border-line bg-white p-6 transition motion-safe:hover:-translate-y-1 hover:border-mint-line hover:shadow-[0_24px_50px_-28px_rgba(10,122,58,0.45)]"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-brand-deep transition group-hover:bg-brand group-hover:text-ink">
                    <Icon name={d.icon} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-extrabold tracking-tight">{d.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{d.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Recall and counterfeit protection ---------- */}
        <SafetySection />

        {/* ---------- Security ---------- */}
        <section id="security" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Eyebrow>Enterprise-grade by design</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Built so your company can trust it.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Security and control are part of how jindjinni is built, not an add-on.{" "}
                <Link href="/security" className="font-bold text-ink underline decoration-brand decoration-2 underline-offset-4">
                  Read how we protect your data
                </Link>
                .
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trustPoints.map((t) => (
                <article key={t.title} className="rounded-3xl border border-line bg-white p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-brand-deep">
                    <Icon name={t.icon} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-extrabold tracking-tight">{t.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{t.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Pricing, free trial, cancellation ---------- */}
        <section id="pricing" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28" data-testid="pricing">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                {TRIAL_DAYS} days free. Then one simple price.
              </h2>
              <p className="mt-5 text-lg text-muted" data-testid="home-both-note">
                Choose what you run. One operation, Wholesale or Distribution, has one price. Running both costs {book.bothPercent}% more, and each keeps its own customers, suppliers, products, orders and payments.
              </p>
              <p className="mt-5 text-lg text-muted" data-testid="home-trial">
                Every new company gets a {TRIAL_DAYS}-day free trial that starts the day we approve it. Nothing is charged during the trial, and you can cancel before it ends.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3" data-testid="home-operations">
              {[
                { key: "wholesale", title: "Wholesale", body: "Source supplies directly from sellers with quotations and free shipping labels, check each package, and sell on to distributors.", ops: 1 as const },
                { key: "distribution", title: "Distribution", body: "Buy from wholesalers with purchase orders, and sell to pharmacies and other retail outlets.", ops: 1 as const },
                { key: "both", title: "Both", body: "Run Wholesale and Distribution under one sign-in, each completely separate. Staff can be assigned to one or the other.", ops: 2 as const },
              ].map((o) => (
                <article key={o.key} className="rounded-3xl border border-line bg-white p-7" data-testid={`home-op-${o.key}`}>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">{o.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{o.body}</p>
                  <Link href={`/${o.key}`} className="mt-2 inline-block text-sm font-extrabold text-ink underline decoration-brand decoration-2 underline-offset-4">See what {o.key === "both" ? "both" : o.title} includes</Link>
                  <p className="mt-4 text-2xl font-extrabold tracking-tight">{usd(monthlyPrice(book, o.ops))}<span className="text-base font-bold">/month</span></p>
                  <p className="text-sm font-semibold text-muted">or {usd(yearlyPrice(book, o.ops))}/year</p>
                  {o.ops === 2 && <p className="mt-1 text-sm font-bold text-brand-deep">{book.bothPercent}% more than one operation</p>}
                  {/* Each button opens sign-up with this operation and plan already chosen. */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={signupHref(o.key as "wholesale" | "distribution" | "both", "monthly")} data-testid={`choose-${o.key}-monthly`} className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Choose Monthly</Link>
                    <Link href={signupHref(o.key as "wholesale" | "distribution" | "both", "yearly")} data-testid={`choose-${o.key}-yearly`} className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-ink transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Choose Yearly</Link>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <article className="rounded-3xl border border-line bg-white p-7" data-testid="price-monthly">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Monthly</h3>
                <p className="mt-3 text-4xl font-extrabold tracking-tight">{usd(MONTHLY_CENTS)}<span className="text-lg font-bold">/month</span></p>
                <p className="mt-1 text-sm font-semibold text-muted">Billed monthly &middot; one operation</p>
                <p className="mt-3 text-sm font-bold text-ink" data-testid="price-monthly-both">Running both: {usd(monthlyPrice(book, 2))}/month</p>
                <Link href="/signup?plan=monthly" data-testid="choose-monthly" className="mt-4 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Choose Monthly</Link>
              </article>
              <article className="rounded-3xl border-2 border-brand bg-white p-7" data-testid="price-yearly">
                <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted">
                  Yearly <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-extrabold normal-case tracking-normal text-ink">Best Value</span>
                </h3>
                <p className="mt-3 text-sm font-semibold text-muted line-through">{usd(YEARLY_REGULAR_CENTS)}/year</p>
                <p className="text-4xl font-extrabold tracking-tight">{usd(YEARLY_CENTS)}<span className="text-lg font-bold">/year</span></p>
                <p className="mt-1 text-sm font-bold text-brand-deep">Save {usd(YEARLY_SAVINGS_CENTS)} per year &middot; one operation</p>
                <p className="mt-3 text-sm font-bold text-ink" data-testid="price-yearly-both">Running both: {usd(yearlyPrice(book, 2))}/year (save {usd(yearlySavings(book, 2))})</p>
                <Link href="/signup?plan=yearly" data-testid="choose-yearly" className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-ink transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Choose Yearly</Link>
              </article>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-line bg-white p-7">
                <h3 className="text-lg font-extrabold tracking-tight">How billing works</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
                  <li>Auto-pay only: credit card, debit card or ACH bank account.</li>
                  <li data-testid="home-proration">Monthly plans are billed on the 1st of every month, in advance. The first day after your free trial we charge only for the days left in that month (a prorated charge), then the full {usd(MONTHLY_CENTS)} on the 1st of every month after that.</li>
                  <li>Yearly plans are charged once, the first day after your trial, and again on the same date every year. No proration.</li>
                  <li>If a payment doesn&rsquo;t go through you have a 3-day grace period to fix it. After that the account is suspended until it does.</li>
                </ul>
              </div>
              <div className="rounded-3xl border border-line bg-white p-7" data-testid="home-cancel">
                <h3 className="text-lg font-extrabold tracking-tight">Cancel any time</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
                  <li data-testid="home-cancel-trial">{CANCEL_TRIAL_TEXT}</li>
                  <li data-testid="home-cancel-monthly">{CANCEL_MONTHLY_TEXT}</li>
                  <li data-testid="home-cancel-yearly">{CANCEL_YEARLY_TEXT}</li>
                  <li>{CANCEL_COMEBACK_TEXT}</li>
                </ul>
              </div>
            </div>
            <p className="mt-6 text-sm font-semibold text-muted">
              Billing opens soon; nothing is charged today. Full details are in our{" "}
              <Link href="/terms" className="font-bold text-ink underline decoration-brand decoration-2 underline-offset-4">Terms and Conditions</Link>.
            </p>
          </div>
        </section>

        {/* ---------- Affiliate program ---------- */}
        <AffiliateProgramSection id="affiliates" exampleText={affiliateExample(MONTHLY_CENTS, affiliateCut(MONTHLY_CENTS), usd)} />

        {/* ---------- Final CTA ---------- */}
        <section className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-brand px-6 py-16 text-center sm:px-12 sm:py-24">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/25"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-ink/10"
            />
            <div className="relative">
              <span className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-white shadow-lg">
                <LogoMark className="h-24 w-auto" />
              </span>
              <h2 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Less Time Managing Systems. More Time Running Your Business.
              </h2>
              <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
                {stack.map((s) => (
                  <li key={s} className="rounded-full bg-white/70 px-4 py-1.5 text-sm font-bold text-ink">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mx-auto mt-6 max-w-xl text-lg font-semibold text-ink/80">
                Every department of your company, connected with jindjinni.
              </p>
              <p className="mt-2 flex items-center justify-center gap-2 text-base font-bold text-ink">
                <Sparkle className="h-4 w-4" />
                Your business wishes, our command.
                <Sparkle className="h-4 w-4" />
              </p>
              <div className="mt-9 flex flex-col items-center gap-4">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-8 py-4 text-base font-bold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Get Started
                  <Icon name="arrow" className="h-5 w-5" />
                </Link>
                <p className="text-base font-semibold text-ink/80">
                  Already have an account?{" "}
                  <Link href="/login" className="font-extrabold text-ink underline decoration-2 underline-offset-4">
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
