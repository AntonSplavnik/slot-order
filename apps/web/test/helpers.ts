import type { MenuItem, OptionGroup } from "@slot-order/core";
import {
  type Cart,
  type OrderStatus,
  type OrderSummary,
  OrderSummarySchema,
  type PublicMenu,
  PublicMenuSchema,
  priceCart,
  type StaffOrder,
  StaffOrderSchema,
} from "@slot-order/core";
import { line, seedMenu } from "../../../packages/core/test/fixtures/menu";
import type { FetchLike } from "../src/lib/api";
import type { StorageLike } from "../src/lib/cart";

// The web library tests' world (docs/design.md §11.2, §11.4, docs/handoffs/m6-web-tests.md): the seed menu
// as the browser sees it, an in-memory storage and one that throws, a recording fetch stub, and summaries of
// orders as the API answers them. No DOM, no network, no real clock.

export { line, seedMenu };

/** Deep-freezes `value`, so a library function that mutates its input fails loudly (ESM runs in strict mode). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The menu of `GET /menu` (§10): the seed without its promo codes, frozen. */
export const publicMenu: PublicMenu = deepFreeze(PublicMenuSchema.parse(seedMenu));

/** `menu` as the API would serve it: parsed with `PublicMenuSchema` (promo codes stripped), frozen. */
export function toPublic(menu: unknown): PublicMenu {
  return deepFreeze(PublicMenuSchema.parse(menu));
}

/** The public seed item with this id; throws on a typo. */
export function item(id: string): MenuItem {
  const found = publicMenu.items.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no seed item ${id}`);
  return found;
}

/** The option group `groupId` of the seed item `itemId`; throws on a typo. */
export function group(itemId: string, groupId: string): OptionGroup {
  const found = item(itemId).optionGroups.find((g) => g.id === groupId);
  if (found === undefined) throw new Error(`no group ${groupId} on ${itemId}`);
  return found;
}

/** A frozen cart. */
export function cart(lines: Cart["lines"], promoCode?: string): Cart {
  return deepFreeze(promoCode === undefined ? { lines } : { lines, promoCode });
}

/** One Burger Menu: 12.90 (§7.4's worked example). */
export const BURGER: Cart = cart([line("burger-menu")]);

/** A large Chicken Burger with garlic ×2 (2 × 9.40) and three colas (3 × 2.90): 27.50. */
export const TWO_LINES: Cart = cart([
  line("chicken-burger", { options: ["burger-large", "sauce-garlic"], quantity: 2 }),
  line("cola", { quantity: 3 }),
]);

// Storage.

/** A `StorageLike` over a Map; `map` is exposed for the tests that look inside. */
export function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** A `StorageLike` whose every method throws, like `localStorage` with site data blocked. */
export function throwingStorage(): StorageLike {
  const fail = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

// Fetch.

export type RecordedCall = { input: string; init: RequestInit | undefined };

export type StubFetch = FetchLike & {
  calls: RecordedCall[];
  /** The `idx`-th call (default the first); fails the test when there is none. */
  call(idx?: number): RecordedCall;
};

/** A fetch that records every call and answers the queued answers in order: a `Response`, or an `Error`
 * to reject with. Running out of answers rejects with a message that names the unexpected call. */
export function stubFetch(answers: Array<Response | Error>): StubFetch {
  const queue = [...answers];
  const calls: RecordedCall[] = [];
  const fn = async (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init });
    const next = queue.shift();
    if (next === undefined) throw new Error(`stubFetch: no answer queued for ${input}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return Object.assign(fn, {
    calls,
    call(idx = 0): RecordedCall {
      const recorded = calls[idx];
      if (recorded === undefined) throw new Error(`stubFetch: no call #${idx}`);
      return recorded;
    },
  });
}

/** A JSON answer. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** The error body of §12. */
export function apiError(code: string, extra: Record<string, unknown> = {}): unknown {
  return { error: { code, message: `${code} message`, ...extra } };
}

/** The method a recorded call used; fetch's default is GET. */
export function methodOf(call: RecordedCall): string {
  return (call.init?.method ?? "GET").toUpperCase();
}

/** The headers a recorded call sent, whatever form the client passed them in. */
export function headersOf(call: RecordedCall): Headers {
  return new Headers(call.init?.headers);
}

// Orders as the API answers them (§10.1).

export const ORDER_ID = "6f1c2b9e-3d4a-4f5b-8c7d-1e2f3a4b5c6d";
export const SLOT_START = "2026-11-09T11:30:00.000Z";
export const CREATED_AT = "2026-11-09T11:00:00.000Z";
export const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_1";

/** An `OrderSummary` for one Burger Menu at 12:30 in `status`, with the fields §10.1 gives that status;
 * `fields` replace or add. Validated with `OrderSummarySchema`, so a test cannot build an impossible shape. */
export function summary(status: OrderStatus, fields: Partial<OrderSummary> = {}): OrderSummary {
  const byStatus: Record<OrderStatus, Partial<OrderSummary>> = {
    held: { checkoutUrl: CHECKOUT_URL, holdExpiresAt: "2026-11-09T11:10:00.000Z" },
    paid: { pickupCode: "A1B1C001", paidAt: "2026-11-09T11:02:00.000Z" },
    ready: {
      pickupCode: "A1B1C001",
      paidAt: "2026-11-09T11:02:00.000Z",
      readyAt: "2026-11-09T11:25:00.000Z",
    },
    picked_up: {
      pickupCode: "A1B1C001",
      paidAt: "2026-11-09T11:02:00.000Z",
      readyAt: "2026-11-09T11:25:00.000Z",
      pickedUpAt: "2026-11-09T11:31:00.000Z",
    },
    expired: { expiredAt: "2026-11-09T11:10:00.000Z" },
    cancelled: { cancelledAt: "2026-11-09T11:10:00.000Z" },
  };
  return OrderSummarySchema.parse({
    id: ORDER_ID,
    status,
    slotStart: SLOT_START,
    slotLabel: "12:30",
    customerName: "Ada",
    itemCount: 1,
    receipt: priceCart(seedMenu, BURGER),
    createdAt: CREATED_AT,
    ...byStatus[status],
    ...fields,
  });
}

/** The staff view of the paid order above (§10.1 `StaffOrder`). */
export function staffOrder(fields: Partial<StaffOrder> = {}): StaffOrder {
  const receipt = priceCart(seedMenu, BURGER);
  return StaffOrderSchema.parse({
    id: ORDER_ID,
    status: "paid",
    pickupCode: "A1B1C001",
    customerName: "Ada",
    slotStart: SLOT_START,
    slotLabel: "12:30",
    lines: receipt.lines,
    itemCount: receipt.itemCount,
    totalCents: receipt.totalCents,
    paidAt: "2026-11-09T11:02:00.000Z",
    ...fields,
  });
}
