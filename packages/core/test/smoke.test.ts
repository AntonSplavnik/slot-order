import { expect, test } from "vitest";
import { SlotConfigSchema } from "../src/index";

test("core exports", () => {
  expect(SlotConfigSchema).toBeDefined();
});
