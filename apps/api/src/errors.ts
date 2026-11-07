import { type ApiError as ApiErrorBody, type ApiErrorCode, CartError } from "@slot-order/core";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { SlotFullError } from "./repo/types";

// Errors (docs/design.md §12): every error answers JSON `{ error: { code, message, lineIndex?, issues? } }`
// with the status of its code. Routes throw `ApiError`; `toApiError` maps what core and the repository
// throw, and anything unexpected becomes `internal` with a generic message.

/** §12: the HTTP status of every code. */
const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  validation: 400,
  empty_cart: 400,
  too_many_lines: 400,
  unknown_item: 400,
  item_inactive: 400,
  options_on_combo: 400,
  unknown_option: 400,
  duplicate_option: 400,
  option_count: 400,
  quantity_out_of_range: 400,
  invalid_price: 400,
  promo_invalid: 400,
  closed_day: 409,
  too_far: 409,
  slot_not_on_grid: 409,
  slot_past_cutoff: 409,
  slot_too_soon: 409,
  too_many_items: 409,
  slot_full: 409,
  payment_unavailable: 502,
  order_not_found: 404,
  not_found: 404,
  invalid_transition: 409,
  invalid_code: 404,
  unauthorized: 401,
  bad_signature: 400,
  internal: 500,
};

/** The default message of every code: for people, never carrying internals. */
const MESSAGES: Record<ApiErrorCode, string> = {
  validation: "The request is not valid.",
  empty_cart: "The cart is empty.",
  too_many_lines: "The cart has too many lines.",
  unknown_item: "An item is not on the menu.",
  item_inactive: "An item is not available right now.",
  options_on_combo: "A combo takes no options.",
  unknown_option: "An option does not belong to its item.",
  duplicate_option: "An option is chosen twice.",
  option_count: "An item has too few or too many options.",
  quantity_out_of_range: "A quantity is out of range.",
  invalid_price: "An item's price is not valid.",
  promo_invalid: "The promo code is not valid.",
  closed_day: "The restaurant is closed that day.",
  too_far: "That day is too far ahead.",
  slot_not_on_grid: "That is not a pickup slot.",
  slot_past_cutoff: "That slot can no longer be ordered.",
  slot_too_soon: "That slot is too soon; choose a later one.",
  too_many_items: "The order has more items than a slot can take.",
  slot_full: "That slot is full.",
  payment_unavailable: "Payment is unavailable right now.",
  order_not_found: "No order has that id.",
  not_found: "Not found.",
  invalid_transition: "The order cannot move to that status now.",
  invalid_code: "No order has that pickup code.",
  unauthorized: "A valid staff token is required.",
  bad_signature: "The signature is not valid.",
  internal: "Something went wrong on our side.",
};

type ApiErrorDetails = { message?: string; lineIndex?: number; issues?: readonly unknown[] };

/** An error the API answers as it is: the code decides the status (§12). */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;
  readonly lineIndex: number | undefined;
  readonly issues: readonly unknown[] | undefined;

  constructor(code: ApiErrorCode, { message, lineIndex, issues }: ApiErrorDetails = {}) {
    super(message ?? MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.lineIndex = lineIndex;
    this.issues = issues;
  }

  /** The response body of §12; `lineIndex` and `issues` only when there are some. */
  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.lineIndex === undefined ? {} : { lineIndex: this.lineIndex }),
        ...(this.issues === undefined ? {} : { issues: [...this.issues] }),
      },
    };
  }
}

/**
 * §12's mapping: `CartError` → 400 with its code and line, `SlotFullError` → 409 `slot_full`, `ZodError`
 * → 400 `validation` with Zod's issues; anything else → 500 `internal`, whose message says nothing of it.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof CartError) return new ApiError(error.code, { lineIndex: error.lineIndex });
  if (error instanceof SlotFullError) return new ApiError("slot_full");
  if (error instanceof ZodError) return new ApiError("validation", { issues: error.issues });
  return new ApiError("internal");
}
