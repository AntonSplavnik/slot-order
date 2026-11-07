import { defineConfig } from "vitest/config";

// The database suite (docs/design.md §13 Database): against the local Supabase stack, which must be
// running (`supabase start`); `test/db/setup.ts` resets it from the migrations and seed first. Files run
// one at a time because they share the database.
process.env.TZ ??= "UTC";

export default defineConfig({
  test: {
    include: ["test/db/**/*.test.ts"],
    globalSetup: ["./test/db/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
