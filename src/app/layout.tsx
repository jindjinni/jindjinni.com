import type { Metadata } from "next";
import "./globals.css";

// Using the system font stack rather than next/font/google here: this
// sandbox's network policy can't reach fonts.googleapis.com at build time,
// and a system stack means zero network dependency for anyone building this
// project, anywhere. Swap in next/font/google (or a self-hosted font via
// next/font/local) once you're ready to pick a brand typeface -- see
// SPEC.md.

export const metadata: Metadata = {
  title: "Ledger",
  description: "Inventory and invoicing for resellers of conditioned goods.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
