import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Database drivers load native/WASM assets at runtime; keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // The app build type-checks application code only; `yarn typecheck` covers
  // tests and tooling as well.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // Only the end-to-end run needs browser source maps (for coverage mapping).
  productionBrowserSourceMaps: process.env.E2E_SOURCE_MAPS === "1",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
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
