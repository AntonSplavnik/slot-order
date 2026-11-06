import { defineConfig } from "vitest/config";

// The slot tests pin Berlin wall-clock behaviour while the process runs in UTC, as on Workers, unless TZ
// is set: `test:berlin` runs the same suite with the host in Berlin, and must give the same results.
process.env.TZ ??= "UTC";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
