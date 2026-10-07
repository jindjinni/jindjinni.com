import type { NextConfig } from "next";

// Headers on every response. They keep the Service from being shown inside another website, tell search engines and
// AI crawlers not to collect or train on it, and keep the signed-in app out of search results entirely. (No site-wide
// Content-Security-Policy here on purpose: a few routes, such as chat files, set their own locked-down one and it must stay.)
const baseHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Robots-Tag", value: "noai, noimageai" },
];
const appHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" }];

const nextConfig: NextConfig = {
  // The finished code the browser receives carries no source maps, and the server does not announce what it runs on.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      ...["/dashboard/:path*", "/api/:path*", "/invite/:path*", "/accept-terms", "/onboarding", "/closed", "/no-access", "/unsubscribe/:path*"].map((source) => ({ source, headers: appHeaders })),
    ];
  },
  // Archive, Audit log and Database moved under Settings; old bookmarks still land in the right place.
  async redirects() {
    return [
      { source: "/dashboard/purchasing/archive", destination: "/dashboard/settings/archive", permanent: false },
      { source: "/dashboard/purchasing/audit-log", destination: "/dashboard/settings/audit-log", permanent: false },
      { source: "/dashboard/database", destination: "/dashboard/settings/database", permanent: false },
    ];
  },
  experimental: {
    // Default is 1mb; CSV/Excel catalog and customer imports (see
    // src/lib/spreadsheet-import.ts) can comfortably exceed that.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
