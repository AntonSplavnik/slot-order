import { afterAll, afterEach, beforeEach } from "vitest";
import { createSupabaseRepository } from "../../src/repo/supabase";
import { describeRepositoryContract } from "../repo/contract";
import { closeDb, expectNoMismatches, resetOrders, service } from "./helpers";

// docs/design.md §10.2: the repository contract against the Supabase repository, through PostgREST with
// the service-role key as the Worker calls it. Orders, slots and Stripe events are emptied before each
// test (the menu and settings keep the seed); the §8.2 invariant is checked after each.

beforeEach(resetOrders);
afterEach(expectNoMismatches);
afterAll(closeDb);

describeRepositoryContract("supabase", async () => createSupabaseRepository(service));
