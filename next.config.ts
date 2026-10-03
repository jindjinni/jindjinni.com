import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1mb; CSV/Excel catalog and customer imports (see
    // src/lib/spreadsheet-import.ts) can comfortably exceed that.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
