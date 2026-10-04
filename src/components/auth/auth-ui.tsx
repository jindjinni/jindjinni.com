import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo, Icon, LogoMark, Sparkle } from "@/components/landing/icons";

export const authBtnPrimary =
  "inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-bold text-ink shadow-[0_10px_30px_-10px_rgba(31,209,107,0.8)] transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";

export const authBtnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-brand-deep px-5 py-2.5 text-sm font-bold text-brand-deep transition hover:bg-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

/** Page chrome shared by sign-in, sign-up and onboarding: landing-style header, mint backdrop, footer line. */
export function AuthShell({
  children,
  headerLink,
}: {
  children: ReactNode;
  headerLink?: { prompt: string; label: string; href: string };
}) {
  return (
    <div className="auth-theme relative flex min-h-full flex-1 flex-col overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_80%_at_50%_0%,#dff7e9_0%,rgba(236,251,242,0.6)_45%,rgba(255,255,255,0)_100%)]"
      />
      <header className="relative z-10 border-b border-line/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center" aria-label="jindjinni home">
            <BrandLogo markClass="h-12 w-auto" wordClass="h-5 w-auto sm:h-7" priority />
          </Link>
          {headerLink ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-muted sm:gap-3">
              <span className="hidden sm:inline">{headerLink.prompt}</span>
              <Link
                href={headerLink.href}
                className="whitespace-nowrap rounded-full border border-line bg-white px-4 py-2 font-bold text-ink transition hover:border-ink"
              >
                {headerLink.label}
              </Link>
            </p>
          ) : (
            <Link href="/" className="text-sm font-bold text-muted hover:text-ink">
              Back to home
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-14">{children}</main>

      <footer className="relative z-10 px-4 pb-8 text-center text-xs font-semibold text-muted">
        &copy; {new Date().getFullYear()} jindjinni &middot; Your business wishes, our command.
      </footer>
    </div>
  );
}

/** The rounded white card the forms sit in. */
export function AuthCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`w-full rounded-[28px] border border-line bg-white shadow-[0_30px_80px_-40px_rgba(12,31,52,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Green brand panel (lamp, tagline, short promise list) used beside the sign-in form on wide screens. */
export function BrandPanel({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="relative hidden overflow-hidden rounded-l-[28px] bg-brand p-10 text-ink lg:flex lg:flex-col lg:justify-between">
      <Sparkle className="absolute right-10 top-10 h-8 w-8 opacity-90" />
      <Sparkle className="absolute right-24 top-24 h-5 w-5 opacity-80" />
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/90 shadow-[0_20px_40px_-20px_rgba(12,31,52,0.5)]">
        <LogoMark className="h-16 w-auto" />
      </div>
      <div>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight">{title}</h2>
        <ul className="mt-6 flex flex-col gap-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-base font-semibold">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-brand">
                <Icon name="check" className="h-3.5 w-3.5" />
              </span>
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm font-bold text-ink/70">Your business wishes, our command.</p>
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {children}
    </p>
  );
}

/** A labelled group of fields on the long sign-up / onboarding forms. */
export function AuthSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-mint/40 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand" />
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
