import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
