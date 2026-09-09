import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the production Docker image; traced from
  // the monorepo root so workspace packages land in .next/standalone.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default withNextIntl(nextConfig);
