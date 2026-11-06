import { expect, test } from "vitest";
import { createApp } from "../src/app";

test("GET /health answers ok", async () => {
  const res = await createApp().request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
