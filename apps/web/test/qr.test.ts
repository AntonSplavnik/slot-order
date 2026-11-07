import QRCode from "qrcode";
import { describe, expect, test } from "vitest";
import { pickupUrl, qrSvg } from "../src/lib/qr";

// docs/design.md §3 "Pickup code" (the QR code encodes the staff pickup URL /staff/pickup?code=…, so staff
// scan it with the phone's camera app) and §11.2 `qr.ts`.

const URL_A = "https://web.example/staff/pickup?code=A1B1C001";

describe("pickupUrl: the origin, /staff/pickup?code= and the code (§3, §11.2)", () => {
  test("the staff pickup URL on the web origin", () => {
    expect(pickupUrl("https://web.example", "A1B1C001")).toBe(URL_A);
  });

  test("the code is sent as given, lower case included (the API normalises, §8.3)", () => {
    expect(pickupUrl("https://web.example", "a1b1C001")).toBe(
      "https://web.example/staff/pickup?code=a1b1C001",
    );
  });
});

describe("qrSvg: qrcode's SVG of the text, margin 1 (§11.2)", () => {
  test("an SVG with a viewBox", async () => {
    const svg = await qrSvg(URL_A);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
  });

  test("exactly qrcode's toString(text, { type: 'svg', margin: 1 })", async () => {
    expect(await qrSvg(URL_A)).toBe(await QRCode.toString(URL_A, { type: "svg", margin: 1 }));
  });

  test("another text gives another SVG", async () => {
    expect(await qrSvg(URL_A)).not.toBe(
      await qrSvg("https://web.example/staff/pickup?code=A1B1C002"),
    );
  });
});
