import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// docs/design.md §11.3: core ships TypeScript source, so Next compiles it; OpenNext builds the Worker (§17).
const nextConfig: NextConfig = {
  transpilePackages: ["@slot-order/core"],
  // `next dev` would otherwise write an AGENTS.md into the app; the repo keeps its own rules (CLAUDE.md).
  agentRules: false,
};

export default nextConfig;

// Bindings in `next dev` (§17); the web Worker reads none, so this is harmless here.
initOpenNextCloudflareForDev();
