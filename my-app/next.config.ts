import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/*": [
      "./database/migrations/001_initial_schema.sql",
      "./lib/supabase/prod-ca-2021.crt",
    ],
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,

  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
