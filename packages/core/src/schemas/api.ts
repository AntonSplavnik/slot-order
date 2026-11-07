import { z } from "zod";
import { CartErrorCodeSchema, CartSchema } from "./cart";
import { MenuSchema } from "./menu";
import { CancelReasonSchema, OrderStatusSchema, PickupCodeSchema } from "./orders";
import { PricedLineSchema, ReceiptSchema } from "./receipt";
import { DayStatusSchema, DayStringSchema, SlotErrorCodeSchema, SlotReasonSchema } from "./slots";

// The API's request and response shapes (docs/design.md §10.1). Instants travel as ISO 8601 strings with
// an offset, UTC in responses.

export const IsoInstantSchema = z.iso.datetime({ offset: true });

export const HealthSchema = z.object({ ok: z.literal(true) });

/** The menu as customers see it: without the promo code list. */
export const PublicMenuSchema = MenuSchema.omit({ promoCodes: true });
export type PublicMenu = z.infer<typeof PublicMenuSchema>;

export const SlotsQuerySchema = z.object({
  date: DayStringSchema,
  items: z.coerce.number().int().min(1).max(100).default(1),
});
export type SlotsQuery = z.infer<typeof SlotsQuerySchema>;

export const SlotAvailabilityDtoSchema = z.object({
  start: IsoInstantSchema,
  label: z.string(),
  available: z.number().int().nonnegative(),
  bookable: z.boolean(),
  reason: SlotReasonSchema.optional(),
});
export type SlotAvailabilityDto = z.infer<typeof SlotAvailabilityDtoSchema>;

export const SlotsResponseSchema = z.object({
  date: DayStringSchema,
  status: DayStatusSchema,
  slots: z.array(SlotAvailabilityDtoSchema),
});
export type SlotsResponse = z.infer<typeof SlotsResponseSchema>;

export const CreateOrderRequestSchema = CartSchema.extend({
  slotStart: IsoInstantSchema,
  customerName: z.string().trim().min(1).max(60),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

/** What a customer sees of their order (§10.1): fields present only in the states that have them. */
export const OrderSummarySchema = z.object({
  id: z.uuid(),
  status: OrderStatusSchema,
  slotStart: IsoInstantSchema,
  slotLabel: z.string(),
  customerName: z.string(),
  itemCount: z.number().int().positive(),
  receipt: ReceiptSchema,
  createdAt: IsoInstantSchema,
  pickupCode: PickupCodeSchema.optional(),
  checkoutUrl: z.url().nullable().optional(),
  holdExpiresAt: IsoInstantSchema.optional(),
  cancelReason: CancelReasonSchema.optional(),
  paidAt: IsoInstantSchema.optional(),
  readyAt: IsoInstantSchema.optional(),
  pickedUpAt: IsoInstantSchema.optional(),
  expiredAt: IsoInstantSchema.optional(),
  cancelledAt: IsoInstantSchema.optional(),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const CreateOrderResponseSchema = z.object({
  order: OrderSummarySchema,
  checkoutUrl: z.url().nullable(),
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;

export const StaffOrderSchema = z.object({
  id: z.uuid(),
  status: OrderStatusSchema,
  pickupCode: PickupCodeSchema,
  customerName: z.string(),
  slotStart: IsoInstantSchema,
  slotLabel: z.string(),
  lines: z.array(PricedLineSchema),
  itemCount: z.number().int().positive(),
  totalCents: z.number().int().nonnegative(),
  paidAt: IsoInstantSchema,
  readyAt: IsoInstantSchema.optional(),
  pickedUpAt: IsoInstantSchema.optional(),
});
export type StaffOrder = z.infer<typeof StaffOrderSchema>;

export const StaffSlotSchema = z.object({
  start: IsoInstantSchema,
  label: z.string(),
  booked: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  orders: z.array(StaffOrderSchema),
});
export type StaffSlot = z.infer<typeof StaffSlotSchema>;

export const StaffBoardSchema = z.object({
  date: DayStringSchema,
  status: DayStatusSchema,
  slots: z.array(StaffSlotSchema),
});
export type StaffBoard = z.infer<typeof StaffBoardSchema>;

export const StaffQuerySchema = z.object({ date: DayStringSchema.optional() });
export const PickupRequestSchema = z.object({ code: z.string().min(1).max(20) });
export type PickupRequest = z.infer<typeof PickupRequestSchema>;

/** Every error code of §12. */
export const ApiErrorCodeSchema = z.enum([
  "validation",
  ...CartErrorCodeSchema.options,
  ...SlotErrorCodeSchema.options,
  "payment_unavailable",
  "order_not_found",
  "not_found",
  "invalid_transition",
  "invalid_code",
  "unauthorized",
  "bad_signature",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    lineIndex: z.number().int().nonnegative().optional(),
    issues: z.array(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
