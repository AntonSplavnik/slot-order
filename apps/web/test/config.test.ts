import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { apiBaseUrl } from "../src/lib/config";

// docs/design.md §11.2 `config.ts` and §11.3: NEXT_PUBLIC_API_URL (baked in at build time) without a
// trailing slash, default http://localhost:8787.

const KEY = "NEXT_PUBLIC_API_URL";

describe("apiBaseUrl (§11.2, §11.3)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[KEY];
    Reflect.deleteProperty(process.env, KEY);
  });
  afterEach(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, KEY);
    else process.env[KEY] = saved;
  });

  test("unset → http://localhost:8787", () => {
    expect(apiBaseUrl()).toBe("http://localhost:8787");
  });

  test("empty → the default", () => {
    process.env[KEY] = "";
    expect(apiBaseUrl()).toBe("http://localhost:8787");
  });

  test("set without a slash → as it is", () => {
    process.env[KEY] = "https://slot-order-api.example.workers.dev";
    expect(apiBaseUrl()).toBe("https://slot-order-api.example.workers.dev");
  });

  test("set with a trailing slash → the slash removed", () => {
    process.env[KEY] = "https://api.example/";
    expect(apiBaseUrl()).toBe("https://api.example");
  });
});
