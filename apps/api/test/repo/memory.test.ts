import { seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { seedConfig } from "../../../../packages/core/test/fixtures/slotConfigs";
import { createMemoryRepository } from "../../src/repo/memory";
import { describeRepositoryContract } from "./contract";

// docs/design.md §10.2: the repository contract against the in-memory repository the route tests use.
// test/db/repository.test.ts runs the same contract against Supabase.

describeRepositoryContract("memory", async () =>
  createMemoryRepository({ settings: seedConfig, menu: seedMenu }),
);
