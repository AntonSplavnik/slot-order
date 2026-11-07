import type {
  ApiErrorCode,
  Cart,
  CreateOrderRequest,
  CreateOrderResponse,
  DayString,
  OrderSummary,
  PublicMenu,
  Receipt,
  SlotsResponse,
  StaffBoard,
  StaffOrder,
} from "@slot-order/core";

// The API client (docs/design.md §11.2): the only way the screens reach the API. Every answer is parsed with
// the core schema; every failure is an ApiClientError. Not implemented yet (M6 contract).

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

/** The client on `baseUrl` (no trailing slash), over `fetchFn` (the tests pass a stub). */
export function createApi(_baseUrl: string, _fetchFn: FetchLike = fetch): Api {
  throw new Error("not implemented");
}
