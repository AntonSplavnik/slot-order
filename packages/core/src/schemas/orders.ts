import { z } from "zod";

// Order states and codes (docs/design.md §8).

export const ORDER_STATUSES = [
  "held",
  "paid",
  "ready",
  "picked_up",
  "expired",
  "cancelled",
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const CANCEL_REASONS = ["stripe_failed", "session_expired", "refunded_slot_full"] as const;
export const CancelReasonSchema = z.enum(CANCEL_REASONS);
export type CancelReason = z.infer<typeof CancelReasonSchema>;

/** Crockford's base32 alphabet: no I, L, O, U (§3 Pickup code). */
export const PICKUP_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PickupCodeSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{8}$/, "8 pickup-code characters");
export type PickupCode = z.infer<typeof PickupCodeSchema>;
