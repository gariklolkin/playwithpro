import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** Vendor ingestion hosts behind the same-origin `/ph` path (EU region). */
const POSTHOG_INGEST_HOST = "https://eu.i.posthog.com";
const POSTHOG_ASSETS_HOST = "https://eu-assets.i.posthog.com";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the production Docker image; traced from
  // the monorepo root so workspace packages land in .next/standalone.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  // The analytics SDK posts to paths with a trailing slash; a redirect there
  // would turn every batch into two requests.
  skipTrailingSlashRedirect: true,
  // Same-origin ingestion proxy: browser capture goes to play-with.pro/ph and
  // is forwarded to the vendor, so tracker blocklists do not silently drop
  // it. Inert without a client key (the SDK is never loaded).
  async rewrites() {
    return [
      {
        source: "/ph/static/:path*",
        destination: `${POSTHOG_ASSETS_HOST}/static/:path*`,
      },
      {
        source: "/ph/:path*",
        destination: `${POSTHOG_INGEST_HOST}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
