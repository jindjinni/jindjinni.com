import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo, Icon, type IconName } from "@/components/landing/icons";
import type { Audience, Check } from "@/lib/landing-content";
import { DIRECT_SOURCING, SAFETY_CHECKS, SAFETY_LIMITS } from "@/lib/landing-content";
import { AFFILIATE_PROGRAM, REFERRED_DISCOUNT_PERCENT } from "@/lib/affiliate-program";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-bold text-ink shadow-[0_10px_30px_-10px_rgba(31,209,107,0.8)] transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-7 py-3.5 text-base font-bold text-ink transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-deep">{children}</p>;
}

export function CheckList({ items, columns = false }: { items: string[]; columns?: boolean }) {
  return (
    <ul className={`mt-6 grid gap-3 ${columns ? "sm:grid-cols-2" : ""}`}>
      {items.map((t) => (
        <li key={t} className="flex items-start gap-3 text-base font-medium text-ink">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-ink">
            <Icon name="check" className="h-3.5 w-3.5" />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

const NAV: { href: string; label: string }[] = [
  { href: "/#platform", label: "Departments" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/distribution", label: "Distribution" },
  { href: "/#who", label: "Who it's for" },
  { href: "/#security", label: "Security" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/affiliates", label: "Affiliates" },
];

/** The sticky top bar shared by the home page and the Wholesale / Distribution / Both pages. */
export function SiteHeader() {
  return (
    <>
    {/* A slim bar above everything, on every size of screen, so the affiliate program is the first thing seen. */}
    <div className="bg-ink text-white" data-testid="affiliate-bar">
      <Link href="/affiliates" className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-bold hover:underline sm:text-sm">
        <span>Refer a company: they save {REFERRED_DISCOUNT_PERCENT}% and you get paid.</span>
        <span className="rounded-full bg-brand px-3 py-0.5 text-ink">Become an affiliate</span>
      </Link>
    </div>
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="jindjinni home">
          <BrandLogo markClass="h-12 w-auto" wordClass="h-5 w-auto sm:h-7" priority />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted lg:flex" aria-label="Sections">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold text-ink hover:bg-slate-100">
            Sign In
          </Link>
          <Link href="/signup" className="whitespace-nowrap rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-hover sm:px-5">
            Get Started
          </Link>
        </div>
      </div>
    </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <Link href="/" aria-label="jindjinni home" className="shrink-0">
          <BrandLogo markClass="h-11 w-auto" wordClass="h-6 w-auto" />
        </Link>
        <p className="min-w-0 max-w-md text-center sm:flex-1">
          Your business wishes, our command.
          <span className="block text-xs">© 2026 Plantarz Property Solutions LLC. All rights reserved. jindjinni, its software, design and content are proprietary and may not be copied, scraped or used to train AI. jindjinni is business software. It does not provide legal, tax, accounting or medical advice.</span>
        </p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-semibold">
          <Link href="/wholesale" className="hover:text-ink">Wholesale</Link>
          <Link href="/distribution" className="hover:text-ink">Distribution</Link>
          <Link href="/both" className="hover:text-ink">Both</Link>
          <Link href="/login" className="hover:text-ink">Sign In</Link>
          <Link href="/signup" className="hover:text-ink">Get Started</Link>
          <Link href="/affiliates" className="hover:text-ink" data-testid="footer-affiliates">Become an affiliate</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/acceptable-use" className="hover:text-ink">Acceptable Use</Link>
          <Link href="/security" className="hover:text-ink">Security</Link>
        </div>
      </div>
    </footer>
  );
}

function IconCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-line bg-white p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-brand-deep">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="mt-5 text-lg font-extrabold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
    </article>
  );
}

/** "Who benefits from jindjinni": the kinds of company it is built for. */
/** The Wholesale sourcing model, in four steps. Shown on the home page and on the Wholesale and Both pages. */
export function DirectSourcingSection({ id, white }: { id?: string; white?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 sm:py-24 ${white ? "bg-white" : "bg-slate-50"}`} data-testid="direct-sourcing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>{DIRECT_SOURCING.eyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">{DIRECT_SOURCING.title}</h2>
        <p className="mt-4 max-w-3xl text-lg text-muted">{DIRECT_SOURCING.body}</p>
        {/* A real sequence: order matters, so it is numbered. */}
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {DIRECT_SOURCING.steps.map((st, i) => (
            <li key={st.title} className="rounded-3xl border border-line bg-white p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-ink">{i + 1}</span>
              <h3 className="mt-3 text-lg font-extrabold tracking-tight">{st.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{st.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The affiliate program in full: the three headline facts, the four steps and the rules, with a button to apply. The words live in
 * affiliate-program.ts. `exampleText` is worked out from the price book by the page (never typed here), so it follows the real price.
 */
export function AffiliateProgramSection({ id, exampleText, asPage = false }: { id?: string; exampleText?: string; asPage?: boolean }) {
  const A = AFFILIATE_PROGRAM;
  const Heading = asPage ? "h1" : "h2";
  return (
    <section id={id} className="scroll-mt-20 bg-white py-16 sm:py-24" data-testid="affiliate-program">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>{A.eyebrow}</Eyebrow>
        <Heading className="mt-3 max-w-4xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">{A.title}</Heading>
        <p className="mt-4 max-w-3xl text-lg text-muted" data-testid="affiliate-summary">{A.summary}</p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3" data-testid="affiliate-facts">
          {A.facts.map((f) => (
            <div key={f.value} className="rounded-3xl border-2 border-brand bg-mint p-6">
              <dt className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{f.value}</dt>
              <dd className="mt-1 text-sm font-bold text-ink/80">{f.label}</dd>
            </div>
          ))}
        </dl>

        {/* A real sequence: order matters, so it is numbered. */}
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="affiliate-steps">
          {A.steps.map((st, i) => (
            <li key={st.title} className="rounded-3xl border border-line bg-white p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-ink">{i + 1}</span>
              <h3 className="mt-3 text-lg font-extrabold tracking-tight">{st.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{st.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-line bg-slate-50 p-6" data-testid="affiliate-rules">
            <h3 className="text-lg font-extrabold tracking-tight">The rules, in plain words</h3>
            <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-muted">
              {A.rules.map((r) => (
                <li key={r} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-3xl bg-brand p-6">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight text-ink">What it looks like</h3>
              {exampleText && <p className="mt-2 text-[15px] font-semibold leading-relaxed text-ink" data-testid="affiliate-example">{exampleText}</p>}
            </div>
            <Link href={asPage ? "#apply" : "/affiliates#apply"} className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-bold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" data-testid="affiliate-apply-link">
              {asPage ? "Apply to become an affiliate" : "Become an affiliate"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AudienceSection({ items }: { items: Audience[] }) {
  return (
    <section id="who" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28" data-testid="who-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <Eyebrow>Who it&rsquo;s for</Eyebrow>
          <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Built for companies that buy and sell medical supplies.
          </h2>
          <p className="mt-5 text-lg text-muted">
            If you want the whole company in one place, and you can&rsquo;t afford a recalled or counterfeit item getting into your
            stock, jindjinni was made for you.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <IconCard key={a.title} icon={a.icon} title={a.title} body={a.body} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** The recall and counterfeit checks, and the honest limits of them. Used on the home page and on each operation page. */
export function SafetySection({ id = "safety", checks = SAFETY_CHECKS }: { id?: string; checks?: Check[] }) {
  return (
    <section id={id} className="scroll-mt-20 bg-mint py-20 sm:py-28" data-testid="safety-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <Eyebrow>Recall and counterfeit protection</Eyebrow>
          <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Strict checks, so the wrong product never gets into your business.
          </h2>
          <p className="mt-5 text-lg text-muted">
            Every item that comes through your door is checked. When something looks wrong, jindjinni holds it first and
            lets a person decide.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {checks.map((c) => (
            <IconCard key={c.title} icon={c.icon} title={c.title} body={c.body} />
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm font-semibold text-muted" data-testid="safety-limits">
          {SAFETY_LIMITS}
        </p>
      </div>
    </section>
  );
}
