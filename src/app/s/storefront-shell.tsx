import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame of every public storefront page. It carries the COMPANY's name, not the platform's; a small line at the bottom says the
 * page runs on jindjinni. Reuses the sign-in pages' form styling (auth-theme) so inputs look the same everywhere.
 */
export function StorefrontShell({ name, handle, children }: { name: string; handle: string; children: ReactNode }) {
  return (
    <div className="auth-theme relative flex min-h-full flex-1 flex-col overflow-x-clip bg-white">
      <header className="border-b border-line/70 bg-white">
        <div className="mx-auto flex h-[68px] max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={`/s/${handle}`} className="truncate text-lg font-extrabold tracking-tight text-ink" data-testid="sf-name">{name}</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="px-4 pb-8 text-center text-xs font-semibold text-muted">Powered by jindjinni</footer>
    </div>
  );
}
