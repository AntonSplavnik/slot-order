import { z } from "zod";
import { MenuItemKindSchema, VatCategorySchema } from "./menu";

// A priced cart (docs/design.md §7.5): what the customer sees, what Stripe is charged, what the order stores.

export const VatPartSchema = z.object({
  category: VatCategorySchema,
  rate: z.number().int(),
  grossCents: z.number().int().nonnegative(),
  netCents: z.number().int().nonnegative(),
  vatCents: z.number().int().nonnegative(),
});
export type VatPart = z.infer<typeof VatPartSchema>;

export const PricedLineSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  kind: MenuItemKindSchema,
  optionNames: z.array(z.string()),
  quantity: z.number().int().positive(),
  unitGrossCents: z.number().int().nonnegative(),
  lineGrossCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  parts: z.array(VatPartSchema),
});
export type PricedLine = z.infer<typeof PricedLineSchema>;

/** One line per rate present, ascending by rate; sums of the parts, never recomputed from totals (§7.4). */
export const VatLineSchema = z.object({
  rate: z.number().int(),
  grossCents: z.number().int().nonnegative(),
  netCents: z.number().int().nonnegative(),
  vatCents: z.number().int().nonnegative(),
});
export type VatLine = z.infer<typeof VatLineSchema>;

export const ReceiptSchema = z.object({
  lines: z.array(PricedLineSchema).min(1),
  itemCount: z.number().int().positive(),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  promoCode: z.string().optional(),
  totalCents: z.number().int().nonnegative(),
  vat: z.array(VatLineSchema),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
