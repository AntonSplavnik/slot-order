import { z } from "zod";

// The menu as core prices it (docs/design.md §7.6). The API builds it from the database; the seed and
// the core test fixture share the ids listed in §5.

export const VatCategorySchema = z.enum(["food", "drink"]);
export type VatCategory = z.infer<typeof VatCategorySchema>;

/** Percent per category, integers (the seed: food 7, drink 19). */
export const VatRatesSchema = z.object({
  food: z.number().int().min(0).max(100),
  drink: z.number().int().min(0).max(100),
});
export type VatRates = z.infer<typeof VatRatesSchema>;

export const OptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceDeltaCents: z.number().int(),
});
export type Option = z.infer<typeof OptionSchema>;

export const OptionGroupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    minChoices: z.number().int().nonnegative(),
    maxChoices: z.number().int().positive(),
    options: z.array(OptionSchema).min(1),
  })
  .refine((g) => g.minChoices <= g.maxChoices, "minChoices must not exceed maxChoices")
  .refine(
    (g) => g.maxChoices <= g.options.length,
    "maxChoices must not exceed the number of options",
  );
export type OptionGroup = z.infer<typeof OptionGroupSchema>;

export const ComboComponentSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
});
export type ComboComponent = z.infer<typeof ComboComponentSchema>;

export const MenuItemKindSchema = z.enum(["item", "combo"]);
export type MenuItemKind = z.infer<typeof MenuItemKindSchema>;

export const MenuItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    priceCents: z.number().int().nonnegative(),
    vatCategory: VatCategorySchema,
    kind: MenuItemKindSchema,
    sort: z.number().int(),
    active: z.boolean(),
    optionGroups: z.array(OptionGroupSchema),
    components: z.array(ComboComponentSchema),
  })
  .refine((i) => i.kind === "item" || i.optionGroups.length === 0, "a combo has no option groups")
  .refine((i) => i.kind === "combo" || i.components.length === 0, "only a combo has components")
  .refine((i) => i.kind === "item" || i.components.length > 0, "a combo needs components");
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const PromoKindSchema = z.enum(["percent", "fixed"]);
export const PromoCodeSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]{2,20}$/, "2–20 upper-case letters or digits"),
    kind: PromoKindSchema,
    value: z.number().int().nonnegative(),
    active: z.boolean(),
  })
  .refine((p) => p.kind !== "percent" || p.value <= 100, "a percent code is at most 100");
export type PromoCode = z.infer<typeof PromoCodeSchema>;

export const MenuSchema = z.object({
  items: z.array(MenuItemSchema),
  promoCodes: z.array(PromoCodeSchema),
  vatRates: VatRatesSchema,
});
export type Menu = z.infer<typeof MenuSchema>;
