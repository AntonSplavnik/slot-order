import { PublicMenuSchema } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { expectJson, makeApp, request, seedMenu } from "../helpers/app";

// docs/design.md §10 (GET /menu: the Menu without its promo codes), §10.1 PublicMenu.

describe("GET /menu", () => {
  test("answers 200 with the seed menu (items, groups, options, combos, VAT rates)", async () => {
    const { app } = makeApp();
    const res = await request(app, "GET", "/menu");
    expectJson(res, 200, PublicMenuSchema);
    const { promoCodes: _hidden, ...publicMenu } = seedMenu;
    expect(res.json).toEqual(publicMenu);
  });

  test("has no promoCodes key: customers never see the code list", async () => {
    const { app } = makeApp();
    const res = await request(app, "GET", "/menu");
    expect(res.status).toBe(200);
    // PublicMenuSchema strips unknown keys when it parses, so the raw body is checked.
    expect(res.json).not.toHaveProperty("promoCodes");
    expect(res.text).not.toContain("HAHN10");
  });
});
