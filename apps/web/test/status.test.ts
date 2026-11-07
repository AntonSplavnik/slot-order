import {
  CANCEL_REASONS,
  type CancelReason,
  ORDER_STATUSES,
  type OrderStatus,
} from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { type StatusView, shouldPoll, statusView } from "../src/lib/status";
import { summary } from "./helpers";

// docs/design.md §11.1 `/orders/[id]` and §11.2 `status.ts`: the status page's title, body and tone per
// status, the cancel reason in words, and polling only while held. Every summary is one the API could send
// (`OrderSummarySchema`, §10.1), for a slot labelled 12:30.

describe("statusView per status (§11.2)", () => {
  test.each<[OrderStatus, StatusView]>([
    [
      "held",
      {
        title: "Waiting for your payment",
        body: "Your slot is held for a few minutes while you pay.",
        tone: "waiting",
      },
    ],
    [
      "paid",
      { title: "Paid", body: "Pick up at 12:30. Show this code at the counter.", tone: "good" },
    ],
    ["ready", { title: "Ready, come and get it", body: "Pick up at 12:30.", tone: "good" }],
    ["picked_up", { title: "Enjoy your meal", body: "", tone: "done" }],
    [
      "expired",
      { title: "Your slot hold ran out", body: "Start again from the menu.", tone: "bad" },
    ],
  ])("%s → %j", (status, view) => {
    expect(statusView(summary(status))).toEqual(view);
  });

  test("paid and ready name the order's own slot label", () => {
    expect(statusView(summary("paid", { slotLabel: "18:45" })).body).toBe(
      "Pick up at 18:45. Show this code at the counter.",
    );
    expect(statusView(summary("ready", { slotLabel: "18:45" })).body).toBe("Pick up at 18:45.");
  });

  test("a held order without a checkout URL yet reads the same", () => {
    expect(statusView(summary("held", { checkoutUrl: null })).title).toBe(
      "Waiting for your payment",
    );
  });
});

describe("statusView for a cancelled order: the reason in words (§11.1, §11.2)", () => {
  test.each<[CancelReason, string]>([
    ["stripe_failed", "Payment could not be started; nothing was charged."],
    ["session_expired", "The payment page expired; nothing was charged."],
    ["refunded_slot_full", "Payment refunded: the slot filled up while you were paying."],
  ])("%s → %j", (cancelReason, body) => {
    expect(statusView(summary("cancelled", { cancelReason }))).toEqual({
      title: "Order cancelled",
      body,
      tone: "bad",
    });
  });

  test("every cancel reason has its own text", () => {
    const bodies = CANCEL_REASONS.map(
      (cancelReason) => statusView(summary("cancelled", { cancelReason })).body,
    );
    expect(new Set(bodies).size).toBe(CANCEL_REASONS.length);
  });

  test('without a reason → "Nothing was charged."', () => {
    expect(statusView(summary("cancelled"))).toEqual({
      title: "Order cancelled",
      body: "Nothing was charged.",
      tone: "bad",
    });
  });
});

describe("shouldPoll: only a held order is polled (§11.1, §11.2)", () => {
  test.each(ORDER_STATUSES.map((status) => [status, status === "held"] as const))(
    "%s → %s",
    (status, polled) => {
      expect(shouldPoll(status)).toBe(polled);
    },
  );
});
