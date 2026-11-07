import type { ApiClientCode } from "./api";

// One sentence per error code for the screens (docs/design.md §11.2, §12): a complete map, so a new code in
// core fails the typecheck here.

const TEXTS: Record<ApiClientCode, string> = {
  validation: "Some details are missing or not valid.",
  empty_cart: "Your cart is empty.",
  too_many_lines: "Your cart has too many lines.",
  unknown_item: "An item in your cart is no longer on the menu.",
  item_inactive: "An item in your cart is not available right now.",
  options_on_combo: "A menu cannot have options.",
  unknown_option: "An option in your cart is no longer available.",
  duplicate_option: "An option was chosen twice.",
  option_count: "An item has too many or too few options.",
  quantity_out_of_range: "A quantity is out of range.",
  invalid_price: "An item has an invalid price.",
  promo_invalid: "The promo code is not valid.",
  closed_day: "We are closed on that day.",
  too_far: "That day is too far ahead.",
  slot_not_on_grid: "That pickup time does not exist.",
  slot_past_cutoff: "That slot is past its order cut-off.",
  slot_too_soon: "That slot is too soon to prepare your order.",
  too_many_items: "Too many items for one slot.",
  slot_full: "That slot is full.",
  payment_unavailable: "Payment could not be started. Please try again.",
  order_not_found: "We could not find that order.",
  not_found: "That page does not exist.",
  invalid_transition: "The order is not in a state for that.",
  invalid_code: "That pickup code is not valid.",
  unauthorized: "The staff token is not valid.",
  bad_signature: "The request signature is not valid.",
  internal: "Something went wrong on our side.",
  network: "The connection failed. Check your network and try again.",
  invalid_response: "The server answered something unexpected.",
};

export function errorText(code: ApiClientCode): string {
  return TEXTS[code];
}
