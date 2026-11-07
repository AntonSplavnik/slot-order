import { defineConfig } from "vitest/config";

// The library tests (docs/design.md §11.4): pure functions, no DOM; the process in UTC like the other suites.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
