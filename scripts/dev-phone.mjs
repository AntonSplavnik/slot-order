#!/usr/bin/env node
// `pnpm dev:phone` (docs/design.md §15): the API and the web app bound to this machine's LAN address, so a phone on
// the same Wi-Fi reviews a branch without any deploy. `wrangler dev` reads apps/api/.dev.vars; WEB_ORIGIN is
// overridden with the phone-facing web origin (CORS and Stripe's return URLs). `next dev` gets NEXT_PUBLIC_API_URL
// for the LAN API (the process environment wins over .env.local) and DEV_PHONE_HOST, which next.config.ts turns
// into `allowedDevOrigins` (Next blocks its dev resources for a foreign origin otherwise). Overrides: LAN_IP,
// WEB_PORT, API_PORT.
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";

const WEB_PORT = process.env.WEB_PORT ?? "3001";
const API_PORT = process.env.API_PORT ?? "8787";

/** The first non-internal IPv4 address, Wi-Fi and Ethernet (`en0`, `en1`, …) before tunnels. */
function lanAddress() {
  const candidates = Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((entry) => ({ name, ...entry })))
    .filter((entry) => entry.family === "IPv4" && !entry.internal);
  const preferred = candidates.find((entry) => /^en\d+$/.test(entry.name)) ?? candidates[0];
  return preferred?.address ?? null;
}

const ip = process.env.LAN_IP ?? lanAddress();
if (ip === null) {
  console.error("No LAN address found. Join a Wi-Fi network, or set LAN_IP.");
  process.exit(1);
}
const webOrigin = `http://${ip}:${WEB_PORT}`;
const apiUrl = `http://${ip}:${API_PORT}`;

const api = spawn(
  "pnpm",
  [
    "--filter",
    "@slot-order/api",
    "exec",
    "wrangler",
    "dev",
    "--ip",
    "0.0.0.0",
    "--port",
    API_PORT,
    "--var",
    `WEB_ORIGIN:${webOrigin}`,
  ],
  { stdio: "inherit" },
);
const web = spawn(
  "pnpm",
  ["--filter", "@slot-order/web", "exec", "next", "dev", "-H", "0.0.0.0", "-p", WEB_PORT],
  { stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_API_URL: apiUrl, DEV_PHONE_HOST: ip } },
);
const children = [api, web];

console.log(`
  Phone (same Wi-Fi):  ${webOrigin}
  API:                 ${apiUrl}   (Stripe's return URLs point at ${webOrigin};
                       run \`stripe listen --forward-to localhost:${API_PORT}/webhooks/stripe\` for the webhook)
`);

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
for (const child of children) child.on("exit", (code) => stop(code ?? 0));
