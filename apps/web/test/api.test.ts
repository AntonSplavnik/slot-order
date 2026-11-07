import {
  type CreateOrderRequest,
  priceCart,
  type SlotsResponse,
  type StaffBoard,
} from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { type ApiClientCode, ApiClientError, createApi } from "../src/lib/api";
import {
  apiError,
  BURGER,
  CHECKOUT_URL,
  cart,
  headersOf,
  json,
  line,
  methodOf,
  ORDER_ID,
  publicMenu,
  type RecordedCall,
  SLOT_START,
  seedMenu,
  staffOrder,
  stubFetch,
  summary,
} from "./helpers";

// docs/design.md §11.2 `api.ts`: the screens' only way to the API (§10). JSON in and out; every answer
// parsed with core's schema; a non-2xx `ApiError` body → ApiClientError with its status, code, message and
// lineIndex; any other non-2xx body → `internal`; a 2xx body failing its schema → `invalid_response`;
// fetch throwing → `network`, status 0. The staff token travels as `Authorization: Bearer <token>`.
// Every call goes through a recording stub; nothing touches the network.

const BASE = "https://api.example";
const DAY = "2026-11-09";

const SLOTS: SlotsResponse = {
  date: DAY,
  status: "open",
  slots: [
    { start: SLOT_START, label: "12:30", available: 20, bookable: true },
    {
      start: "2026-11-09T11:15:00.000Z",
      label: "12:15",
      available: 20,
      bookable: false,
      reason: "too_soon",
    },
  ],
};

const BOARD: StaffBoard = {
  date: DAY,
  status: "open",
  slots: [{ start: SLOT_START, label: "12:30", booked: 1, capacity: 20, orders: [staffOrder()] }],
};

const ORDER_REQUEST: CreateOrderRequest = { ...BURGER, slotStart: SLOT_START, customerName: "Ada" };

/** The rejection of `promise`, which must be an ApiClientError. */
async function rejection(promise: Promise<unknown>): Promise<ApiClientError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiClientError);
  return error as ApiClientError;
}

/** The fields of an ApiClientError a test compares. */
function fields(error: ApiClientError): {
  status: number;
  code: ApiClientCode;
  message: string;
  lineIndex: number | undefined;
} {
  return {
    status: error.status,
    code: error.code,
    message: error.message,
    lineIndex: error.lineIndex,
  };
}

/** The JSON body a recorded call sent. */
function bodyOf(call: RecordedCall): unknown {
  const body = call.init?.body;
  expect(typeof body).toBe("string");
  return JSON.parse(body as string);
}

/** A GET without a body. */
function expectGet(call: RecordedCall, url: string): void {
  expect(call.input).toBe(url);
  expect(methodOf(call)).toBe("GET");
  expect(call.init?.body ?? undefined).toBeUndefined();
}

/** A POST of JSON. */
function expectPost(call: RecordedCall, url: string): void {
  expect(call.input).toBe(url);
  expect(methodOf(call)).toBe("POST");
  expect(headersOf(call).get("Content-Type")).toMatch(/^application\/json/);
}

describe("menu(): GET /menu → PublicMenu (§10, §11.2)", () => {
  test("one GET of https://api.example/menu without a body; the menu parsed", async () => {
    const stub = stubFetch([json(publicMenu)]);
    expect(await createApi(BASE, stub).menu()).toEqual(publicMenu);
    expect(stub.calls).toHaveLength(1);
    expectGet(stub.call(), `${BASE}/menu`);
  });

  test("a public call sends no Authorization header", async () => {
    const stub = stubFetch([json(publicMenu)]);
    await createApi(BASE, stub).menu();
    expect(headersOf(stub.call()).get("Authorization")).toBeNull();
  });

  test("a 200 that is not a menu ({}) → invalid_response, status 200", async () => {
    const error = await rejection(createApi(BASE, stubFetch([json({})])).menu());
    expect(error).toMatchObject({ status: 200, code: "invalid_response" });
  });

  // SPEC: §11.2 says a 2xx body that fails its schema is invalid_response; a body that is not JSON at
  // all cannot pass it either, so it is the same code.
  test("a 200 whose body is not JSON → invalid_response, status 200", async () => {
    const stub = stubFetch([new Response("<html>", { status: 200 })]);
    const error = await rejection(createApi(BASE, stub).menu());
    expect(error).toMatchObject({ status: 200, code: "invalid_response" });
  });
});

describe("slots(date, items?): GET /slots → SlotsResponse (§10, §11.2)", () => {
  test("date and items in the query: /slots?date=2026-11-09&items=3", async () => {
    const stub = stubFetch([json(SLOTS)]);
    expect(await createApi(BASE, stub).slots(DAY, 3)).toEqual(SLOTS);
    expectGet(stub.call(), `${BASE}/slots?date=2026-11-09&items=3`);
  });

  test("without items, no items parameter: /slots?date=2026-11-09", async () => {
    const stub = stubFetch([json(SLOTS)]);
    await createApi(BASE, stub).slots(DAY);
    expectGet(stub.call(), `${BASE}/slots?date=2026-11-09`);
  });

  test("an answer failing SlotsResponseSchema → invalid_response", async () => {
    const stub = stubFetch([json({ ...SLOTS, status: "maybe" })]);
    expect(await rejection(createApi(BASE, stub).slots(DAY))).toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });
});

describe("quote(cart): POST /quotes → Receipt (§10, §11.2)", () => {
  const withCode = cart(BURGER.lines, "HAHN10");
  const receipt = priceCart(seedMenu, withCode);

  test("POSTs the cart as JSON and answers the parsed receipt", async () => {
    const stub = stubFetch([json(receipt)]);
    expect(await createApi(BASE, stub).quote(withCode)).toEqual(receipt);
    expectPost(stub.call(), `${BASE}/quotes`);
    expect(bodyOf(stub.call())).toEqual(withCode);
  });

  test("a 400 promo_invalid → ApiClientError with status, code and message", async () => {
    const stub = stubFetch([
      json({ error: { code: "promo_invalid", message: "The promo code is unknown." } }, 400),
    ]);
    expect(fields(await rejection(createApi(BASE, stub).quote(withCode)))).toEqual({
      status: 400,
      code: "promo_invalid",
      message: "The promo code is unknown.",
      lineIndex: undefined,
    });
  });

  test("a 400 unknown_item with lineIndex 1 → lineIndex 1", async () => {
    const twoLines = cart([line("cola"), line("nope")]);
    const stub = stubFetch([json(apiError("unknown_item", { lineIndex: 1 }), 400)]);
    expect(await rejection(createApi(BASE, stub).quote(twoLines))).toMatchObject({
      status: 400,
      code: "unknown_item",
      lineIndex: 1,
    });
  });
});

describe("createOrder(request): POST /orders → CreateOrderResponse (§10, §11.2)", () => {
  const created = { order: summary("held"), checkoutUrl: CHECKOUT_URL };

  test("POSTs the request as JSON; a 201 parsed", async () => {
    const stub = stubFetch([json(created, 201)]);
    expect(await createApi(BASE, stub).createOrder(ORDER_REQUEST)).toEqual(created);
    expectPost(stub.call(), `${BASE}/orders`);
    expect(bodyOf(stub.call())).toEqual(ORDER_REQUEST);
  });

  test("a 201 failing CreateOrderResponseSchema → invalid_response, status 201", async () => {
    const stub = stubFetch([json({ checkoutUrl: CHECKOUT_URL }, 201)]);
    expect(await rejection(createApi(BASE, stub).createOrder(ORDER_REQUEST))).toMatchObject({
      status: 201,
      code: "invalid_response",
    });
  });

  test.each<[number, ApiClientCode]>([
    [409, "slot_full"],
    [409, "slot_too_soon"],
    [400, "validation"],
    [502, "payment_unavailable"],
  ])("a %i %s → that code and status", async (status, code) => {
    const stub = stubFetch([json(apiError(code), status)]);
    expect(await rejection(createApi(BASE, stub).createOrder(ORDER_REQUEST))).toMatchObject({
      status,
      code,
      message: `${code} message`,
    });
  });
});

describe("order(id): GET /orders/:id → OrderSummary (§10, §11.2)", () => {
  test("GETs /orders/<id>; the summary parsed", async () => {
    const paid = summary("paid");
    const stub = stubFetch([json(paid)]);
    expect(await createApi(BASE, stub).order(ORDER_ID)).toEqual(paid);
    expectGet(stub.call(), `${BASE}/orders/${ORDER_ID}`);
  });

  test("a 404 order_not_found → that code", async () => {
    const stub = stubFetch([json(apiError("order_not_found"), 404)]);
    expect(await rejection(createApi(BASE, stub).order(ORDER_ID))).toMatchObject({
      status: 404,
      code: "order_not_found",
    });
  });
});

describe("the staff calls carry Authorization: Bearer <token> (§10.5, §11.2)", () => {
  test("staffBoard(token, date) → GET /staff/orders?date=2026-11-09 with the token", async () => {
    const stub = stubFetch([json(BOARD)]);
    expect(await createApi(BASE, stub).staffBoard("tok", DAY)).toEqual(BOARD);
    expectGet(stub.call(), `${BASE}/staff/orders?date=2026-11-09`);
    expect(headersOf(stub.call()).get("Authorization")).toBe("Bearer tok");
  });

  test("staffBoard(token) → GET /staff/orders without a query", async () => {
    const stub = stubFetch([json(BOARD)]);
    await createApi(BASE, stub).staffBoard("tok");
    expectGet(stub.call(), `${BASE}/staff/orders`);
    expect(headersOf(stub.call()).get("Authorization")).toBe("Bearer tok");
  });

  test("a 401 unauthorized → that code", async () => {
    const stub = stubFetch([json(apiError("unauthorized"), 401)]);
    expect(await rejection(createApi(BASE, stub).staffBoard("wrong"))).toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  test("staffReady(token, id) → POST /staff/orders/<id>/ready with the token; the order parsed", async () => {
    const ready = staffOrder({ status: "ready", readyAt: "2026-11-09T11:25:00.000Z" });
    const stub = stubFetch([json(ready)]);
    expect(await createApi(BASE, stub).staffReady("tok", ORDER_ID)).toEqual(ready);
    const call = stub.call();
    expect(call.input).toBe(`${BASE}/staff/orders/${ORDER_ID}/ready`);
    expect(methodOf(call)).toBe("POST");
    expect(headersOf(call).get("Authorization")).toBe("Bearer tok");
  });

  test("staffReady: a 409 invalid_transition → that code", async () => {
    const stub = stubFetch([json(apiError("invalid_transition"), 409)]);
    expect(await rejection(createApi(BASE, stub).staffReady("tok", ORDER_ID))).toMatchObject({
      status: 409,
      code: "invalid_transition",
    });
  });

  test("staffPickup(token, code) → POST /staff/pickup with { code } as typed; the order parsed", async () => {
    const pickedUp = staffOrder({ status: "picked_up", pickedUpAt: "2026-11-09T11:31:00.000Z" });
    const stub = stubFetch([json(pickedUp)]);
    expect(await createApi(BASE, stub).staffPickup("tok", "a1b1 c001")).toEqual(pickedUp);
    expectPost(stub.call(), `${BASE}/staff/pickup`);
    expect(headersOf(stub.call()).get("Authorization")).toBe("Bearer tok");
    expect(bodyOf(stub.call())).toEqual({ code: "a1b1 c001" });
  });

  test("staffPickup: a 404 invalid_code → that code", async () => {
    const stub = stubFetch([json(apiError("invalid_code"), 404)]);
    expect(await rejection(createApi(BASE, stub).staffPickup("tok", "ZZZZZZZZ"))).toMatchObject({
      status: 404,
      code: "invalid_code",
    });
  });
});

describe("failures that are not the API's error shape (§11.2)", () => {
  test("a non-2xx body that is not JSON (a 502 HTML page) → internal, status 502", async () => {
    const stub = stubFetch([new Response("<html>", { status: 502 })]);
    expect(await rejection(createApi(BASE, stub).menu())).toMatchObject({
      status: 502,
      code: "internal",
    });
  });

  test("a non-2xx error body with a code outside §12 → internal, with its status", async () => {
    const stub = stubFetch([json({ error: { code: "teapot", message: "short and stout" } }, 418)]);
    expect(await rejection(createApi(BASE, stub).order(ORDER_ID))).toMatchObject({
      status: 418,
      code: "internal",
    });
  });

  // SPEC: §11.2 fixes the code and status of a network failure, not the message. Decision (the brief's):
  // the message is the cause's.
  test("fetch rejecting → network, status 0, the cause's message", async () => {
    const stub = stubFetch([new TypeError("fetch failed")]);
    expect(fields(await rejection(createApi(BASE, stub).menu()))).toEqual({
      status: 0,
      code: "network",
      message: "fetch failed",
      lineIndex: undefined,
    });
  });

  test("every ApiClientError is an Error named ApiClientError", async () => {
    const network = await rejection(createApi(BASE, stubFetch([new TypeError("x")])).menu());
    const api = await rejection(
      createApi(BASE, stubFetch([json(apiError("internal"), 500)])).menu(),
    );
    for (const error of [network, api]) {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ApiClientError");
    }
  });
});

describe("the base URL is used as given (§11.2 config.ts strips the slash)", () => {
  test("a base with a path keeps it, and the client adds no slash of its own", async () => {
    const stub = stubFetch([json(publicMenu), json(SLOTS)]);
    const api = createApi("https://api.example/v1", stub);
    await api.menu();
    await api.slots(DAY);
    expect(stub.calls.map((c) => c.input)).toEqual([
      "https://api.example/v1/menu",
      "https://api.example/v1/slots?date=2026-11-09",
    ]);
  });
});
