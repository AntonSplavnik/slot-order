import { defineConfig } from "vitest/config";

// The slot tests pin Berlin wall-clock behaviour while the process runs in UTC, as on Workers.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
