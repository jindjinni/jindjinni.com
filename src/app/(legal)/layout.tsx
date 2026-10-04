import Link from "next/link";
import { BrandLogo } from "@/components/landing/icons";
import { LEGAL_LINKS } from "@/lib/legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-theme flex min-h-full flex-1 flex-col bg-white">
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-[72px] max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="jindjinni home">
            <BrandLogo markClass="h-12 w-auto" wordClass="h-5 w-auto sm:h-7" priority />
          </Link>
          <Link href="/login" className="text-sm font-bold text-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-line/70">
        <nav aria-label="Legal" className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm font-semibold text-muted sm:px-6">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
