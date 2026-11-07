import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// docs/design.md §11.3, §17: the defaults; no incremental cache, as nothing uses ISR.
export default defineCloudflareConfig();
