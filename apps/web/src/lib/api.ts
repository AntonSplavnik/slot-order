import {
  type ApiErrorCode,
  ApiErrorSchema,
  type Cart,
  type CreateOrderRequest,
  type CreateOrderResponse,
  CreateOrderResponseSchema,
  type DayString,
  type OrderSummary,
  OrderSummarySchema,
  type PublicMenu,
  PublicMenuSchema,
  type Receipt,
  ReceiptSchema,
  type SlotsResponse,
  SlotsResponseSchema,
  type StaffBoard,
  StaffBoardSchema,
  type StaffOrder,
  StaffOrderSchema,
} from "@slot-order/core";
import type { z } from "zod";

// The API client (docs/design.md §11.2): the only way the screens reach the API (§10). Every answer is parsed
// with the core schema; every failure is an ApiClientError.

/** §12's codes, plus the two the client adds: the network failed, or a 2xx answer failed its schema. */
export type ApiClientCode = ApiErrorCode | "network" | "invalid_response";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiClientCode;
  readonly lineIndex: number | undefined;

  constructor(status: number, code: ApiClientCode, message: string, lineIndex?: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.lineIndex = lineIndex;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Api {
  menu(): Promise<PublicMenu>;
  slots(date: DayString, items?: number): Promise<SlotsResponse>;
  quote(cart: Cart): Promise<Receipt>;
  createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse>;
  order(id: string): Promise<OrderSummary>;
  staffBoard(token: string, date?: DayString): Promise<StaffBoard>;
  staffReady(token: string, id: string): Promise<StaffOrder>;
  staffPickup(token: string, code: string): Promise<StaffOrder>;
}

type RequestOptions = { body?: unknown; token?: string };

/** The body as JSON, or `undefined` when it is not JSON (an HTML error page, an empty body). */
async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text());
  } catch {
    return undefined;
  }
}

/** §11.2: a non-2xx answer as an ApiClientError; a body outside §12's shape is `internal`. */
function toError(status: number, body: unknown): ApiClientError {
  const parsed = ApiErrorSchema.safeParse(body);
  if (!parsed.success) return new ApiClientError(status, "internal", `HTTP ${status}`);
  const { code, message, lineIndex } = parsed.data.error;
  return new ApiClientError(status, code, message, lineIndex);
}

/** The client on `baseUrl` (no trailing slash), over `fetchFn` (the tests pass a stub). */
export function createApi(baseUrl: string, fetchFn: FetchLike = fetch): Api {
  async function request<T>(
    schema: z.ZodType<T>,
    method: "GET" | "POST",
    path: string,
    { body, token }: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, init);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ApiClientError(0, "network", message);
    }

    const json = await readJson(response);
    if (!response.ok) throw toError(response.status, json);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiClientError(
        response.status,
        "invalid_response",
        `Unexpected answer from ${method} ${path}`,
      );
    }
    return parsed.data;
  }

  return {
    menu: () => request(PublicMenuSchema, "GET", "/menu"),
    slots: (date, items) => {
      const query = new URLSearchParams({ date });
      if (items !== undefined) query.set("items", String(items));
      return request(SlotsResponseSchema, "GET", `/slots?${query}`);
    },
    quote: (cart) => request(ReceiptSchema, "POST", "/quotes", { body: cart }),
    createOrder: (body) => request(CreateOrderResponseSchema, "POST", "/orders", { body }),
    order: (id) => request(OrderSummarySchema, "GET", `/orders/${encodeURIComponent(id)}`),
    staffBoard: (token, date) => {
      const query = date === undefined ? "" : `?${new URLSearchParams({ date })}`;
      return request(StaffBoardSchema, "GET", `/staff/orders${query}`, { token });
    },
    staffReady: (token, id) =>
      request(StaffOrderSchema, "POST", `/staff/orders/${encodeURIComponent(id)}/ready`, {
        token,
      }),
    staffPickup: (token, code) =>
      request(StaffOrderSchema, "POST", "/staff/pickup", { body: { code }, token }),
  };
}
