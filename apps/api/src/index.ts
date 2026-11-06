import { createApp } from "./app";

const app = createApp();

export default {
  fetch: app.fetch,
  // The Cron Trigger (wrangler.toml): releases expired holds from M4 on (docs/design.md §8.3).
  async scheduled(): Promise<void> {},
} satisfies ExportedHandler<Env>;
