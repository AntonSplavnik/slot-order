import { z } from "zod";

// What a customer sends (docs/design.md §7.1) and how pricing can refuse it (§7.2).

export const CartLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
  optionIds: z.array(z.string().min(1)).max(20),
});
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSchema = z.object({
  lines: z.array(CartLineSchema).min(1).max(30),
  promoCode: z.string().max(40).optional(),
});
export type Cart = z.infer<typeof CartSchema>;

export const CartErrorCodeSchema = z.enum([
  "empty_cart",
  "too_many_lines",
  "unknown_item",
  "item_inactive",
  "options_on_combo",
  "unknown_option",
  "duplicate_option",
  "option_count",
  "quantity_out_of_range",
  "invalid_price",
  "promo_invalid",
]);
export type CartErrorCode = z.infer<typeof CartErrorCodeSchema>;
