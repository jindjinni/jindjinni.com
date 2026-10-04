import type { ReactNode } from "react";
import { Icon, LogoMark, Wordmark, type IconName } from "./icons";

// Decorative product visuals for the landing page. Everything here is sample
// data drawn with plain HTML/CSS (no images, no network) and hidden from
// assistive tech -- the surrounding copy carries the actual message.

function Pill({ tone, children }: { tone: "green" | "amber" | "slate" | "ink"; children: ReactNode }) {
  const tones = {
    green: "bg-mint text-brand-deep ring-mint-line",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    ink: "bg-ink text-white ring-ink",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hero: the whole operation on one screen                             */
/* ------------------------------------------------------------------ */

const sidebar: { icon: IconName; label: string }[] = [
  { icon: "purchasing", label: "Purchasing" },
  { icon: "receiving", label: "Receiving" },
  { icon: "inventory", label: "Inventory" },
  { icon: "invoicing", label: "Invoicing" },
  { icon: "distribution", label: "Distribution" },
  { icon: "accounts", label: "Accounts" },
  { icon: "support", label: "Customer Service" },
];

const activity = [
  { ref: "REF-261004-1", who: "Maria A.", item: "Glucose sensors ×10", stage: "Received", tone: "green" },
  { ref: "REF-261004-2", who: "Hartley Pharmacy", item: "Test strips 50 ct ×24", stage: "In transit", tone: "amber" },
  { ref: "REF-261003-4", who: "D. Okafor", item: "Pen needles 5 mm ×40", stage: "Quoted", tone: "slate" },
  { ref: "REF-261003-1", who: "Lakeside Supply", item: "Lancets 100 ct ×60", stage: "Invoiced", tone: "ink" },
] as const;

export function HeroDashboard() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_30px_80px_-30px_rgba(11,19,14,0.35)]">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b border-line bg-slate-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 rounded-full bg-white px-3 py-0.5 text-[11px] text-muted ring-1 ring-line">
            app.jindjinni.com
          </span>
        </div>

        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-44 shrink-0 border-r border-line bg-white p-3 md:block">
            <div className="mb-3 flex items-center gap-2 px-2 py-1">
              <LogoMark className="h-7 w-auto" />
              <Wordmark className="h-3.5 w-auto" />
            </div>
            <ul className="space-y-0.5">
              {sidebar.map((s, i) => (
                <li
                  key={s.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium ${
                    i === 0 ? "bg-mint text-brand-deep" : "text-muted"
                  }`}
                >
                  <Icon name={s.icon} className="h-4 w-4" />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>

          {/* main */}
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">Today at a glance</p>
              <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-ink">+ New quotation</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                ["Open quotations", "24", "+3 today"],
                ["Packages received", "38", "this week"],
                ["Unpaid invoices", "$12,480", "6 open"],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-2xl border border-line bg-white p-3">
                  <p className="text-[10px] font-medium text-muted sm:text-[11px]">{label}</p>
                  <p className="mt-1 text-lg font-extrabold tracking-tight text-ink tabular-nums sm:text-xl">{value}</p>
                  <p className="text-[10px] font-medium text-brand-deep">{note}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-line">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_5.5rem] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <span>Reference</span>
                <span>Customer</span>
                <span>Stage</span>
              </div>
              {activity.map((r) => (
                <div
                  key={r.ref}
                  className="grid grid-cols-[auto_minmax(0,1fr)_5.5rem] items-center gap-3 border-t border-line px-3 py-2.5 text-xs"
                >
                  <span className="whitespace-nowrap font-semibold text-ink">{r.ref}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{r.who}</span>
                    <span className="block truncate text-[11px] text-muted">{r.item}</span>
                  </span>
                  <span>
                    <Pill tone={r.tone}>{r.stage}</Pill>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* floating notifications */}
      <div className="absolute -left-6 bottom-10 hidden items-center gap-3 rounded-2xl border border-line bg-white p-3 pr-5 shadow-xl sm:flex">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-brand-deep">
          <Icon name="receiving" className="h-5 w-5" />
        </span>
        <span className="text-xs leading-tight">
          <span className="block font-bold text-ink">Package received</span>
          <span className="text-muted">Matched to REF-261004-1</span>
        </span>
      </div>
      <div className="absolute -right-4 -top-5 hidden items-center gap-3 rounded-2xl border border-line bg-white p-3 pr-5 shadow-xl sm:flex">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-ink">
          <Icon name="check" className="h-5 w-5" />
        </span>
        <span className="text-xs leading-tight">
          <span className="block font-bold text-ink">Stock updated</span>
          <span className="text-muted">+10 sensors on hand</span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inventory + invoicing                                               */
/* ------------------------------------------------------------------ */

const stock = [
  { name: "Test strips · 50 ct", onHand: "1,240", inQty: "+300", out: "−185", level: 82 },
  { name: "Glucose sensors · 10 day", onHand: "862", inQty: "+120", out: "−96", level: 64 },
  { name: "Pen needles · 5 mm", onHand: "2,030", inQty: "+0", out: "−410", level: 91 },
  { name: "Lancets · 100 ct", onHand: "415", inQty: "+60", out: "−22", level: 38 },
] as const;

export function InventoryInvoiceMock() {
  return (
    <div aria-hidden="true">
      <div className="rounded-3xl border border-line bg-white p-4 shadow-[0_30px_70px_-35px_rgba(11,19,14,0.35)] sm:p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-brand-deep">
              <Icon name="inventory" className="h-4 w-4" />
            </span>
            Inventory
          </p>
          <Pill tone="green">Live</Pill>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.6fr] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <span>Product</span>
            <span className="text-right">On hand</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
          </div>
          {stock.map((s) => (
            <div
              key={s.name}
              className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.6fr] items-center gap-2 border-t border-line px-3 py-2.5 text-xs"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{s.name}</span>
                <span className="mt-1.5 block h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${s.level < 45 ? "bg-amber-400" : "bg-brand"}`}
                    style={{ width: `${s.level}%` }}
                  />
                </span>
              </span>
              <span className="text-right font-bold tabular-nums text-ink">{s.onHand}</span>
              <span className="text-right font-medium tabular-nums text-brand-deep">{s.inQty}</span>
              <span className="text-right font-medium tabular-nums text-muted">{s.out}</span>
            </div>
          ))}
        </div>
      </div>

      {/* invoice overlapping the inventory card */}
      <div className="relative -mt-6 ml-auto w-[92%] max-w-sm rounded-3xl border border-line bg-white p-4 shadow-[0_30px_70px_-25px_rgba(11,19,14,0.45)] sm:p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-ink">
              <Icon name="invoicing" className="h-4 w-4" />
            </span>
            Invoice INV-1042
          </p>
          <Pill tone="green">Sent</Pill>
        </div>
        <p className="mt-3 text-[11px] text-muted">Bill to · Hartley Pharmacy</p>
        <div className="mt-2 space-y-1.5 border-y border-line py-2.5 text-xs">
          <div className="flex justify-between text-ink">
            <span>Test strips 50 ct ×24</span>
            <span className="tabular-nums">$312.00</span>
          </div>
          <div className="flex justify-between text-ink">
            <span>Pen needles 5 mm ×40</span>
            <span className="tabular-nums">$96.00</span>
          </div>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted">Total</span>
          <span className="text-lg font-extrabold tabular-nums text-ink">$408.00</span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-brand-deep">
          <Icon name="check" className="h-3.5 w-3.5" />
          Inventory updated automatically
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team access                                                         */
/* ------------------------------------------------------------------ */

const team: { name: string; role: string; tone: "ink" | "green" | "slate"; access: string[] }[] = [
  { name: "Priya N.", role: "Manager", tone: "ink", access: ["All departments"] },
  { name: "Marcus T.", role: "Purchasing", tone: "green", access: ["Purchasing", "Customer Service"] },
  { name: "Dana R.", role: "Receiving", tone: "green", access: ["Receiving", "Inventory"] },
  { name: "Lee K.", role: "Accounts", tone: "slate", access: ["Invoicing", "Accounts"] },
];

export function TeamMock() {
  const toggles: [string, boolean][] = [
    ["Purchasing", true],
    ["Receiving", false],
    ["Inventory", true],
    ["Accounts", false],
  ];
  return (
    <div aria-hidden="true">
      <div className="rounded-3xl border border-line bg-white p-4 shadow-[0_30px_70px_-35px_rgba(11,19,14,0.35)] sm:p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-brand-deep">
              <Icon name="team" className="h-4 w-4" />
            </span>
            Your team
          </p>
          <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-ink">+ Invite</span>
        </div>

        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {team.map((m) => (
            <li key={m.name} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-ink">
                {m.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink">{m.name}</span>
                <span className="block truncate text-[11px] text-muted">{m.access.join(" · ")}</span>
              </span>
              <Pill tone={m.tone}>{m.role}</Pill>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-mint-line bg-mint/60 p-2 pl-3">
          <Icon name="mail" className="h-4 w-4 shrink-0 text-brand-deep" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted">newhire@yourcompany.com</span>
          <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-white">Send invite</span>
        </div>
      </div>

      {/* access toggles */}
      <div className="relative -mt-4 ml-auto w-[92%] max-w-xs rounded-3xl border border-line bg-white p-4 shadow-[0_30px_70px_-25px_rgba(11,19,14,0.4)]">
        <p className="text-xs font-bold text-ink">Marcus can access</p>
        <ul className="mt-2.5 space-y-2">
          {toggles.map(([label, on]) => (
            <li key={label} className="flex items-center justify-between text-xs">
              <span className={`flex items-center gap-1.5 ${on ? "text-ink" : "text-muted"}`}>
                {!on && <Icon name="lock" className="h-3.5 w-3.5" />}
                {label}
              </span>
              <span
                className={`flex h-5 w-9 items-center rounded-full p-0.5 ${on ? "justify-end bg-brand" : "justify-start bg-slate-200"}`}
              >
                <span className="h-4 w-4 rounded-full bg-white shadow" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Business profile -> documents                                       */
/* ------------------------------------------------------------------ */

const profileFields = [
  ["Business name", "Sample Supply Co."],
  ["DBA", "Sample Medical Exchange"],
  ["Business address", "100 Main Street, Suite 4"],
  ["Shipping address", "200 Warehouse Way"],
  ["Phone", "(555) 010-2030"],
  ["Email", "orders@samplesupply.com"],
  ["Website", "samplesupply.com"],
  ["Primary contact", "Jordan Lee"],
] as const;

export function ProfileMock() {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]" aria-hidden="true">
      <div className="rounded-3xl border border-line bg-white p-5 shadow-[0_30px_70px_-35px_rgba(11,19,14,0.35)]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-dashed border-mint-line bg-mint text-brand-deep">
            <Icon name="building" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Business profile</p>
            <p className="text-[11px] text-muted">Company logo · filled in once</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {profileFields.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
              <dd className="truncate text-xs font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex items-center justify-center text-brand-deep">
        <span className="flex h-12 w-12 rotate-90 items-center justify-center rounded-full bg-brand text-ink shadow-lg lg:rotate-0">
          <Icon name="arrow" className="h-6 w-6" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {["Quotation", "Invoice", "Receipt", "Report"].map((doc) => (
          <div key={doc} className="rounded-2xl border border-line bg-white p-3 shadow-[0_20px_50px_-30px_rgba(11,19,14,0.4)]">
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <LogoMark className="h-6 w-auto" />
              <span className="min-w-0">
                <span className="block truncate text-[10px] font-bold leading-tight text-ink">Sample Supply Co.</span>
                <span className="block truncate text-[9px] leading-tight text-muted">100 Main Street, Suite 4</span>
              </span>
            </div>
            <p className="mt-2 text-[11px] font-extrabold uppercase tracking-wide text-brand-deep">{doc}</p>
            <div className="mt-2 space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-slate-100" />
              <div className="h-1.5 w-4/5 rounded-full bg-slate-100" />
              <div className="h-1.5 w-3/5 rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
