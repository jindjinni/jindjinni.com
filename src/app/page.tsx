import type { ReactNode } from "react";
import Link from "next/link";
import { usd } from "@/lib/billing-config";
import { currentBook } from "@/lib/pricing-service";
import { monthlyPrice, yearlyPrice, yearlyRegular, yearlySavings } from "@/lib/pricing-rules";

// The prices on this page are the newest ones set in the Lamp; saving a new price refreshes the page at once, and it also refreshes by itself every minute.
export const revalidate = 60;
import { TRIAL_DAYS } from "@/lib/billing-schedule";
import { CANCEL_COMEBACK_TEXT, CANCEL_MONTHLY_TEXT, CANCEL_TRIAL_TEXT, CANCEL_YEARLY_TEXT } from "@/lib/cancellation-copy";
import { BrandLogo, Icon, LogoMark, Sparkle, type IconName } from "@/components/landing/icons";
import {
  ChatMock,
  CommandCenterMock,
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
    body: "Price lists, customers, automatic quotations, shipping labels and live shipment tracking, with every price change on the record.",
  },
  {
    icon: "receiving",
    title: "Receiving",
    body: "Check every incoming package against its quotation, with photos, lot and serial number checks, recall checks and order adjustments.",
  },
  {
    icon: "accounts",
    title: "Accounts",
    body: "See exactly which orders are ready to pay, what is due or overdue, and keep paid orders and monthly reports organized.",
  },
  {
    icon: "support",
    title: "Customer Service",
    body: "Send customers clear payment and adjustment emails from one controlled place, with a record of everything sent.",
  },
  {
    icon: "inventory",
    title: "Inventory",
    body: "Live stock by product, condition and expiration, with a full history of every item that came in or went out.",
  },
  {
    icon: "tag",
    title: "Sales",
    body: "Quote and invoice your own buyers, compare prices and keep your selling side connected to the stock you actually hold.",
  },
  {
    icon: "megaphone",
    title: "Marketing",
    body: "Build contact lists and run email and text campaigns with opt-outs respected automatically.",
  },
  {
    icon: "clock",
    title: "HR",
    body: "Clock in and out, see who is working today and keep time sheets and an activity log for the whole team.",
  },
  {
    icon: "chat",
    title: "Company Chat",
    body: "A built-in chat room for everyone, one for each department, and private messages, with file sharing and live status.",
  },
];

const flow: { icon: IconName; title: string; note: string }[] = [
  { icon: "purchasing", title: "Purchasing", note: "Quote is accepted and shipped" },
  { icon: "receiving", title: "Receiving", note: "Package arrives and is verified" },
  { icon: "accounts", title: "Accounts", note: "Payment is approved" },
  { icon: "support", title: "Customer Service", note: "Customer is notified" },
  { icon: "inventory", title: "Inventory", note: "Stock updates" },
  { icon: "tag", title: "Sales", note: "Invoice goes out" },
];

const stats: { value: string; label: string }[] = [
  { value: "9", label: "connected departments" },
  { value: "1", label: "shared record for every order" },
  { value: "100", label: "team members per company, built for growing businesses" },
  { value: "Private", label: "workspace for every company" },
];

const commandPoints = [
  "A welcome screen for every person, every day",
  "Recalls, safety notices and new-product news straight from the makers of the brands you buy",
  "Company performance for owners and admins: quotations given, shipments received, orders to be paid",
  "Switch between Today, This week and This month",
  "Jump straight into any department",
];

const receivingPoints = [
  "Full-screen camera for package and product photos, taken right inside the intake form",
  "Lot and serial numbers read from photos, then confirmed by the receiver",
  "Repeated, made-up or wrong-shaped serial numbers flagged automatically",
  "Recall lists checked against every received item",
  "Order adjustments written up and sent as a clear PDF",
  "A permanent record of who checked what, and when",
];

const inventoryPoints = [
  "Live stock by product, condition and expiration date",
  "Items post to stock as they are received",
  "Sales and returns update stock automatically",
  "A full stock history of every movement",
  "Estimated prices for what you hold",
  "Quotations and invoices from the same data",
  "Buyer records and price comparison",
  "No second spreadsheet to keep in sync",
];

const teamPoints = [
  "Invite people by email, one at a time or a whole department",
  "Choose which departments each person can open",
  "Roles for owners, admins, managers, agents, receivers and accountants",
  "Sensitive areas locked to the people who need them",
  "Turn anyone's access off the moment they leave",
  "Built to grow with you, from your first hire to a team of up to 100 people",
];

const trustPoints = [
  { icon: "lock" as IconName, title: "Every company is walled off", body: "Each company's records belong to that company alone. Every request is checked against the signed-in person's own company on our servers." },
  { icon: "team" as IconName, title: "Role-based access", body: "People see only the departments their role allows, and the limits are enforced by the server, not just hidden buttons." },
  { icon: "shield" as IconName, title: "An audit trail", body: "Price changes, adjustments and team changes are recorded with who made them and when." },
  { icon: "building" as IconName, title: "Your data, your exit", body: "Download everything as one spreadsheet at any time. You stay in control of your records." },
];

const stack = ["Purchasing", "Receiving", "Accounts", "Customer Service", "Inventory", "Sales", "Marketing", "HR", "Chat"];

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

export default async function Home() {
  const book = await currentBook();
  const MONTHLY_CENTS = monthlyPrice(book, 1);
  const YEARLY_CENTS = yearlyPrice(book, 1);
  const YEARLY_REGULAR_CENTS = yearlyRegular(book, 1);
  const YEARLY_SAVINGS_CENTS = yearlySavings(book, 1);
  return (
    <div className="min-h-full overflow-x-clip bg-white text-ink">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center" aria-label="jindjinni home">
            <BrandLogo markClass="h-12 w-auto" wordClass="h-5 w-auto sm:h-7" priority />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted md:flex" aria-label="Sections">
            <a href="#platform" className="hover:text-ink">Departments</a>
            <a href="#command" className="hover:text-ink">Command center</a>
            <a href="#receiving" className="hover:text-ink">Receiving</a>
            <a href="#team" className="hover:text-ink">Team + Chat</a>
            <a href="#security" className="hover:text-ink">Security</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
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
                Premium enterprise software
              </p>
              <h1 className="relative mt-6 text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                Your Entire Business,{" "}
                <span className="rounded-2xl bg-brand px-3 [box-decoration-break:clone]">One Platform</span>
                <Sparkle className="absolute -right-2 -top-6 hidden h-8 w-8 sm:block" />
                <Sparkle className="absolute right-10 top-0 hidden h-4 w-4 sm:block" />
              </h1>
              <p className="mt-6 text-lg font-bold text-ink sm:text-xl">
                Purchasing. Receiving. Accounts. Customer Service. Inventory. Sales. Marketing. HR. Chat.
              </p>
              <p className="mt-4 max-w-xl text-lg text-muted">
                jindjinni is enterprise software that puts every department of your company on one connected record,
                with a team chat built right in. Enter information once, and every department sees it. Built to
                grow with you, from your first employee to a team of up to 100 people.
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
              <p className="mt-5 max-w-xl text-sm font-semibold text-muted" data-testid="active-only">
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

        {/* ---------- Every department ---------- */}
        <section id="platform" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Eyebrow>Every department, built in</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Stop stitching together separate tools to run your company.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Each department has its own workspace, its own color and its own sidebar, and all of them share the
                same customers, products, orders and people. Your team opens only what their job needs.
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

        {/* ---------- Command center ---------- */}
        <section id="command" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>Your command center</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Sign in to the whole picture.
              </h2>
              <p className="mt-5 text-lg text-muted">
                The Home screen belongs to no single department. It greets your people, keeps you ahead of what is
                happening in your industry, and gives owners and admins a snapshot of how the company is doing.
              </p>
              <CheckList items={commandPoints} />
            </div>
            <CommandCenterMock />
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
                An order moves from department to department as one shared record, so nobody retypes it and nothing
                gets lost in a handoff.
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
                <span className="rounded-2xl bg-brand px-3 [box-decoration-break:clone]">One connected company.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Receiving ---------- */}
        <section id="receiving" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Receiving you can rely on</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Know exactly what came through your door.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Every shipment is opened against its quotation and documented step by step, so problems are caught
                at the dock, not after the money is paid. The system flags what looks wrong, and your people make the
                final call.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {receivingPoints.map((t) => (
                <div key={t} className="flex items-start gap-4 rounded-3xl border border-line bg-white p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mint text-brand-deep">
                    <Icon name={t.startsWith("Full-screen") ? "camera" : t.startsWith("Recall") ? "bell" : "check"} className="h-5 w-5" />
                  </span>
                  <p className="text-base font-semibold leading-snug text-ink">{t}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Inventory + sales ---------- */}
        <section id="inventory" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>Inventory + Sales</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Know What You Have. Know What You Sold.
              </h2>
              <p className="mt-5 text-lg text-muted">
                What you buy, what you hold and what you sell live in one system, so your stock is always the
                latest number and never a guess.
              </p>
              <CheckList items={inventoryPoints} columns />
            </div>
            <InventoryInvoiceMock />
          </div>
        </section>

        {/* ---------- Team + chat ---------- */}
        <section id="team" className="scroll-mt-20 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
              <div className="order-2 lg:order-1">
                <TeamMock />
              </div>
              <div className="order-1 lg:order-2">
                <Eyebrow>Team access</Eyebrow>
                <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                  Your Team. Their Access. Your Control.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  Whether you run a team of five or a growing company of up to 100 people, you decide who can see
                  and change what.
                </p>
                <CheckList items={teamPoints} />
              </div>
            </div>

            <div className="mt-24 grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
              <div>
                <Eyebrow>Built-in company chat</Eyebrow>
                <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                  Talk to your whole organization, right where the work is.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  No separate messaging app to buy, secure or keep in sync. Chat uses the same people, roles and
                  departments as the rest of jindjinni, so the right conversation is always one click away.
                </p>
                <CheckList
                  items={[
                    "An Everyone room for the whole company",
                    "A room for each department, shown only to the people who work in it",
                    "Private one-to-one messages with live status: online, busy, at lunch, away",
                    "Share photos and files, with unread counts in the top menu",
                  ]}
                />
              </div>
              <ChatMock />
            </div>
          </div>
        </section>

        {/* ---------- Business profile ---------- */}
        <section id="profile" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Set up in minutes</Eyebrow>
              <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
                Set up your company once. See it on every document.
              </h2>
              <p className="mt-5 text-lg text-muted">
                Create your company profile and a ready-made starting layout: brands, products, conditions and
                receipt wording. Then make it yours. Your logo and details appear automatically on quotations,
                receipts and reports.
              </p>
            </div>
            <div className="mt-14">
              <ProfileMock />
            </div>
          </div>
        </section>

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
                { key: "wholesale", title: "Wholesale", body: "Buy supplies from individuals with quotations and free shipping labels, check each package, and sell on to distributors.", ops: 1 as const },
                { key: "distribution", title: "Distribution", body: "Buy from wholesalers with purchase orders, and sell to pharmacies and other retail outlets.", ops: 1 as const },
                { key: "both", title: "Both", body: "Run Wholesale and Distribution under one sign-in, each completely separate. Staff can be assigned to one or the other.", ops: 2 as const },
              ].map((o) => (
                <article key={o.key} className="rounded-3xl border border-line bg-white p-7" data-testid={`home-op-${o.key}`}>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">{o.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{o.body}</p>
                  <p className="mt-4 text-2xl font-extrabold tracking-tight">{usd(monthlyPrice(book, o.ops))}<span className="text-base font-bold">/month</span></p>
                  <p className="text-sm font-semibold text-muted">or {usd(yearlyPrice(book, o.ops))}/year</p>
                  {o.ops === 2 && <p className="mt-1 text-sm font-bold text-brand-deep">{book.bothPercent}% more than one operation</p>}
                </article>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <article className="rounded-3xl border border-line bg-white p-7" data-testid="price-monthly">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Monthly</h3>
                <p className="mt-3 text-4xl font-extrabold tracking-tight">{usd(MONTHLY_CENTS)}<span className="text-lg font-bold">/month</span></p>
                <p className="mt-1 text-sm font-semibold text-muted">Billed monthly &middot; one operation</p>
                <p className="mt-3 text-sm font-bold text-ink" data-testid="price-monthly-both">Running both: {usd(monthlyPrice(book, 2))}/month</p>
              </article>
              <article className="rounded-3xl border-2 border-brand bg-white p-7" data-testid="price-yearly">
                <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted">
                  Yearly <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-extrabold normal-case tracking-normal text-ink">Best Value</span>
                </h3>
                <p className="mt-3 text-sm font-semibold text-muted line-through">{usd(YEARLY_REGULAR_CENTS)}/year</p>
                <p className="text-4xl font-extrabold tracking-tight">{usd(YEARLY_CENTS)}<span className="text-lg font-bold">/year</span></p>
                <p className="mt-1 text-sm font-bold text-brand-deep">Save {usd(YEARLY_SAVINGS_CENTS)} per year &middot; one operation</p>
                <p className="mt-3 text-sm font-bold text-ink" data-testid="price-yearly-both">Running both: {usd(yearlyPrice(book, 2))}/year (save {usd(yearlySavings(book, 2))})</p>
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

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Link href="/" aria-label="jindjinni home">
            <BrandLogo markClass="h-11 w-auto" wordClass="h-6 w-auto" />
          </Link>
          <p className="max-w-md text-center">
            Your business wishes, our command.
            <span className="block text-xs">© 2026 Plantarz Property Solutions LLC. All rights reserved. jindjinni, its software, design and content are proprietary and may not be copied, scraped or used to train AI. jindjinni is business software. It does not provide legal, tax, accounting or medical advice.</span>
          </p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-semibold">
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
    </div>
  );
}
