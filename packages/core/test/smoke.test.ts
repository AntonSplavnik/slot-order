import { expect, test } from "vitest";
import { CORE_VERSION } from "../src/index";

test("core exports", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});
