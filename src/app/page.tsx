import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo, Icon, LogoMark, Sparkle, type IconName } from "@/components/landing/icons";
import {
  HeroDashboard,
  InventoryInvoiceMock,
  ProfileMock,
  TeamMock,
} from "@/components/landing/mocks";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-bold text-ink shadow-[0_10px_30px_-10px_rgba(31,209,107,0.8)] transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-7 py-3.5 text-base font-bold text-ink transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const departments: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "purchasing",
    title: "Purchasing",
    body: "Manage customers, products, pricing, quotations, shipping information, and tracking.",
  },
  {
    icon: "receiving",
    title: "Receiving",
    body: "Connect incoming packages directly to the original purchase order and quotation.",
  },
  {
    icon: "inventory",
    title: "Inventory Tracking",
    body: "Know what products you have, quantities available, what was received, and how inventory moves through your business.",
  },
  {
    icon: "invoicing",
    title: "Invoicing",
    body: "Create and manage professional invoices directly from your business data and inventory.",
  },
  {
    icon: "distribution",
    title: "Distribution",
    body: "Manage products, outgoing orders, fulfillment, and distribution activity.",
  },
  {
    icon: "accounts",
    title: "Accounts",
    body: "Keep transaction, adjustment, invoice, and payment information organized.",
  },
  {
    icon: "support",
    title: "Customer Service",
    body: "Give your team access to the order and customer information they need.",
  },
  {
    icon: "team",
    title: "Team Management",
    body: "Invite your team and choose which departments each person can use.",
  },
];

const flow: { icon: IconName; title: string; note: string }[] = [
  { icon: "purchasing", title: "Purchasing", note: "Quote is accepted" },
  { icon: "receiving", title: "Receiving", note: "Package arrives" },
  { icon: "inventory", title: "Inventory", note: "Stock updates" },
  { icon: "invoicing", title: "Invoicing", note: "Invoice is created" },
  { icon: "distribution", title: "Distribution", note: "Order ships" },
  { icon: "accounts", title: "Accounts", note: "Payment is recorded" },
];

const inventoryPoints = [
  "Track inventory quantities",
  "Monitor available products",
  "Record incoming products",
  "Track outgoing products",
  "Create invoices",
  "Manage invoice history",
  "Connect invoices to customers and inventory",
  "Keep transaction records organized",
];

const teamPoints = [
  "Invite employees by email",
  "Assign department access",
  "Control permissions",
  "Give managers broader access",
  "Restrict sensitive areas",
];

const stack = ["Purchasing", "Receiving", "Inventory", "Invoicing", "Distribution", "Accounts", "Customer Service"];

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-deep">{children}</p>
  );
}

function CheckList({ items, columns = false }: { items: string[]; columns?: boolean }) {
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

export default function Home() {
  return (
    <div className="min-h-full overflow-x-clip bg-white text-ink">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center" aria-label="jindjinni home">
            <BrandLogo markClass="h-12 w-auto" wordClass="h-5 w-auto sm:h-7" priority />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-muted md:flex" aria-label="Sections">
            <a href="#platform" className="hover:text-ink">Platform</a>
            <a href="#workflow" className="hover:text-ink">Workflow</a>
            <a href="#inventory" className="hover:text-ink">Inventory + Invoicing</a>
            <a href="#team" className="hover:text-ink">Team</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold text-ink hover:bg-slate-100">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="whitespace-nowrap rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-brand-hover sm:px-5"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative bg-[radial-gradient(60%_55%_at_85%_0%,#d4f7e3_0%,transparent_70%)]">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10 lg:pb-28 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-mint px-3.5 py-1.5 text-xs font-bold text-brand-deep ring-1 ring-inset ring-mint-line">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Built for purchasing &amp; distribution businesses
              </p>
              <h1 className="relative mt-6 text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                Run Your Business From{" "}
                <span className="rounded-2xl bg-brand px-3 [box-decoration-break:clone]">One Place</span>
                <Sparkle className="absolute -right-2 -top-6 hidden h-8 w-8 sm:block" />
                <Sparkle className="absolute right-10 top-0 hidden h-4 w-4 sm:block" />
              </h1>
              <p className="mt-6 text-lg font-bold text-ink sm:text-xl">
                Purchasing. Receiving. Inventory. Invoicing. Distribution. Accounts. Customer Service.
              </p>
              <p className="mt-4 max-w-xl text-lg text-muted">
                One connected platform built to help your business stay organized and keep operations moving.
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
            </div>
            <HeroDashboard />
          </div>
        </section>

        {/* ---------- Everything under one roof ---------- */}
        <section id="platform" className="scroll-mt-20 border-t border-line bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Eyebrow>Everything under one roof</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Stop using multiple disconnected systems to operate your business.
              </h2>
              <p className="mt-5 text-lg text-muted">
                jindjinni connects your departments, customers, orders, inventory, invoices, and team in one
                easy-to-use platform.
              </p>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* ---------- One connected workflow ---------- */}
        <section id="workflow" className="scroll-mt-20 bg-mint py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>One connected workflow</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Enter It Once. Use It Everywhere.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Information should move with the transaction instead of being entered over and over again.
              </p>
            </div>

            <ol className="relative mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <span
                aria-hidden="true"
                className="absolute left-[8.33%] right-[8.33%] top-8 hidden h-0.5 bg-[repeating-linear-gradient(90deg,#1fd16b_0_8px,transparent_8px_16px)] lg:block"
              />
              {flow.map((s, i) => (
                <li key={s.title} className="relative flex items-center gap-4 lg:flex-col lg:gap-3 lg:text-center">
                  <span className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-mint bg-white text-brand-deep shadow-md ring-1 ring-mint-line">
                    <Icon name={s.icon} className="h-7 w-7" />
                  </span>
                  <span>
                    <span className="block text-base font-extrabold">{s.title}</span>
                    <span className="block text-sm text-muted">{s.note}</span>
                  </span>
                  {i < flow.length - 1 && (
                    <Icon
                      name="arrow"
                      className="absolute -bottom-3.5 left-6 h-5 w-5 rotate-90 text-brand-deep sm:hidden"
                    />
                  )}
                </li>
              ))}
            </ol>

            <div className="mt-16 text-center text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              <p>One order.</p>
              <p>One shared record.</p>
              <p>
                <span className="rounded-2xl bg-brand px-3 [box-decoration-break:clone]">One connected operation.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Inventory + invoicing ---------- */}
        <section id="inventory" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>Inventory + Invoicing</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Know What You Have. Know What You Sold.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Track your inventory as products enter and leave your operation. Use the same system to:
              </p>
              <CheckList items={inventoryPoints} columns />
              <p className="mt-8 rounded-2xl bg-mint px-5 py-4 text-base font-bold text-brand-deep ring-1 ring-inset ring-mint-line">
                No separate inventory tracker or invoicing software required.
              </p>
            </div>
            <InventoryInvoiceMock />
          </div>
        </section>

        {/* ---------- Team access ---------- */}
        <section id="team" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 lg:order-1">
              <TeamMock />
            </div>
            <div className="order-1 lg:order-2">
              <Eyebrow>Team access</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Your Team. Their Access. Your Control.
              </h2>
              <p className="mt-5 text-lg text-muted">Business owners can:</p>
              <CheckList items={teamPoints} />
              <p className="mt-8 text-lg font-bold">
                Each employee sees the tools they need for their job.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Business profile ---------- */}
        <section id="profile" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Business profile</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Set up your business once. See it on every document.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Create one business profile and your information can automatically appear on quotations,
                invoices, receipts, and reports.
              </p>
            </div>
            <div className="mt-14">
              <ProfileMock />
            </div>
          </div>
        </section>

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
                Everything your operation needs — connected with jindjinni.
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

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Link href="/" aria-label="jindjinni home">
            <BrandLogo markClass="h-11 w-auto" wordClass="h-6 w-auto" />
          </Link>
          <p className="text-center">
            Your business wishes, our command.
            <span className="block text-xs">© 2026 jindjinni. All rights reserved.</span>
          </p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-semibold">
            <Link href="/login" className="hover:text-ink">Sign In</Link>
            <Link href="/signup" className="hover:text-ink">Get Started</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/security" className="hover:text-ink">Security</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
