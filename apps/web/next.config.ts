import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// docs/design.md §11.3: core ships TypeScript source, so Next compiles it; OpenNext builds the Worker (§17).
const nextConfig: NextConfig = {
  transpilePackages: ["@slot-order/core"],
  // `next dev` would otherwise write an AGENTS.md into the app; the repo keeps its own rules (CLAUDE.md).
  agentRules: false,
  // `pnpm dev:phone` (§15) serves the dev build to a phone by the Mac's LAN address; Next blocks its dev resources
  // (HMR, chunks) for that origin unless it is listed here. Unset in every other run.
  ...(process.env.DEV_PHONE_HOST === undefined
    ? {}
    : { allowedDevOrigins: [process.env.DEV_PHONE_HOST] }),
};

export default nextConfig;

// Bindings in `next dev` (§17); the web Worker reads none, so this is harmless here.
initOpenNextCloudflareForDev();
