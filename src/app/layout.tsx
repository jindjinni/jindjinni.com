import type { Metadata } from "next";
import "./globals.css";
import { NOTICE_FOOTER, NOTICE_FOR_AI, NOTICE_SHORT } from "@/lib/ip-notice";
import { OPERATOR_NAME } from "@/lib/legal";

// Using the system font stack rather than next/font/google here: this
// sandbox's network policy can't reach fonts.googleapis.com at build time,
// and a system stack means zero network dependency for anyone building this
// project, anywhere. Swap in next/font/google (or a self-hosted font via
// next/font/local) once you're ready to pick a brand typeface -- see
// SPEC.md.

export const metadata: Metadata = {
  title: "jindjinni | Software that runs the operations of your business",
  description:
    "jindjinni is operations software for businesses that buy, sell and store goods. Choose your industry and get a ready-made layout for purchasing, receiving, accounts, customer service, inventory, sales, shipping, marketing, HR and team chat on one platform, so you can leave pen, paper and scattered spreadsheets behind. Available today for medical supply wholesalers and distributors, with more industries on the way. Built for teams of up to 100 people.",
  creator: OPERATOR_NAME,
  // Read by crawlers and AI agents that look at a page's metadata.
  other: { "ai-notice": NOTICE_SHORT, copyright: `${OPERATOR_NAME}. All rights reserved.` },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* A notice for any AI agent or scraper that reads the page text. It is in the page text but off screen, and hidden from screen readers. */}
        <div data-ai-notice="true" aria-hidden="true" className="sr-only">
          {NOTICE_FOR_AI}
        </div>
        {/* The same promise in plain sight, for people and for agents that work from screenshots. */}
        <p data-testid="ip-footer" className="px-4 pb-3 pt-2 text-center text-[11px] leading-snug text-slate-500 print:hidden dark:text-slate-400">
          {NOTICE_FOOTER}{" "}
          <a href="/terms" className="underline">
            Terms
          </a>
        </p>
      </body>
    </html>
  );
}
