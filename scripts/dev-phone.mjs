#!/usr/bin/env node
// `pnpm dev:phone` (docs/design.md §15): the API and the web app bound to this machine's LAN address, so a phone on
// the same Wi-Fi reviews a branch without any deploy. `wrangler dev` reads apps/api/.dev.vars; WEB_ORIGIN is
// overridden with the phone-facing web origin (CORS and Stripe's return URLs). `next dev` gets NEXT_PUBLIC_API_URL
// for the LAN API (the process environment wins over .env.local) and DEV_PHONE_HOST, which next.config.ts turns
// into `allowedDevOrigins` (Next blocks its dev resources for a foreign origin otherwise). Overrides: LAN_IP,
// WEB_PORT, API_PORT.
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, realpathSync } from "node:fs";
import { networkInterfaces, platform } from "node:os";

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

/** The installed `workerd` binaries: pnpm keeps them in its store as `@cloudflare+workerd-darwin-<arch>@<version>`. */
function workerdBinaries() {
  const store = "node_modules/.pnpm";
  const found = [];
  for (const entry of readdirSync(store)) {
    const match = /^@cloudflare\+(workerd-darwin-[a-z0-9]+)@/.exec(entry);
    if (match !== null) {
      found.push(
        realpathSync(`${store}/${entry}/node_modules/@cloudflare/${match[1]}/bin/workerd`),
      );
    }
  }
  return found;
}

/** macOS's application firewall allows Node (the web app) once asked, but knows nothing about `workerd`, the
 * API's runtime, so a phone reaches port 3001 and not 8787. Reading the firewall needs no password; allowing does. */
function firewallHint() {
  if (platform() !== "darwin") return;
  const fw = "/usr/libexec/ApplicationFirewall/socketfilterfw";
  const run = (...args) =>
    execFileSync(fw, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    if (!/enabled/i.test(run("--getglobalstate"))) return;
    const allowed = run("--listapps");
    for (const workerd of workerdBinaries()) {
      if (allowed.includes(workerd)) continue;
      console.warn(`
  The macOS firewall is on and does not allow workerd (the API's runtime) yet: the phone will load the page but
  not the menu. Allow it once per workerd version (asks for your password), then restart this command:
    sudo ${fw} --add "${workerd}" && sudo ${fw} --unblockapp "${workerd}"
`);
    }
  } catch {
    // The firewall tool or the store is missing: nothing to say.
  }
}
firewallHint();
/** `DEV_PHONE_CHECK_ONLY=1` runs the checks above and stops, without starting the servers. */
if (process.env.DEV_PHONE_CHECK_ONLY !== undefined) process.exit(0);

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
