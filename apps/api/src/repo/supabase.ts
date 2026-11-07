import { type Booked, type SlotUsage, VAT_RATES_DE_2026 } from "@slot-order/core";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  type ComboComponentRow,
  type MenuItemRow,
  menuFromRows,
  type OptionGroupRow,
  type OptionRow,
  type OrderRow,
  orderFromRow,
  type PromoCodeRow,
  type SettingsRow,
  type SlotRow,
  slotConfigFromRow,
} from "../db/rows";
import {
  InvalidStatusError,
  type NewOrder,
  type Order,
  type Repository,
  SlotFullError,
  type TransitionPatch,
} from "./types";

// The Supabase repository (docs/design.md §10.2): the service-role client through PostgREST, the SQL
// functions of §5 through `rpc`, rows mapped by src/db/rows.ts. `P0001` with `slot_full` or
// `invalid_status` becomes SlotFullError or InvalidStatusError; any other error is rethrown with
// PostgREST's message (never a key: the client keeps those in its headers).

/** The `*_at` column `transition` stamps for each target status (§8.2). */
const STAMP_COLUMN = {
  paid: "paid_at",
  ready: "ready_at",
  picked_up: "picked_up_at",
  cancelled: "cancelled_at",
} as const;

/** PostgREST's answer for a unique violation. */
const UNIQUE_VIOLATION = "23505";

function failure(operation: string, error: PostgrestError): Error {
  if (error.code === "P0001" && error.message === "slot_full") return new SlotFullError();
  if (error.code === "P0001" && error.message === "invalid_status") return new InvalidStatusError();
  return new Error(`${operation} failed (${error.code}): ${error.message}`);
}

/** The data of a PostgREST answer, or its error thrown. */
function dataOf<T>(operation: string, result: { data: unknown; error: PostgrestError | null }): T {
  if (result.error !== null) throw failure(operation, result.error);
  return result.data as T;
}

/** `release_hold` answers a NULL row as an object whose every field is null (§5): that is "nothing". */
function orderOrNull(row: OrderRow | { id: null } | null): Order | null {
  return row === null || row.id === null ? null : orderFromRow(row);
}

export function createSupabaseRepository(client: SupabaseClient): Repository {
  async function selectAll<T>(table: string): Promise<T[]> {
    return dataOf<T[]>(`select ${table}`, await client.from(table).select("*"));
  }

  return {
    async getSettings() {
      const result = await client.from("settings").select("*").eq("id", 1).single();
      return slotConfigFromRow(dataOf<SettingsRow>("select settings", result));
    },

    async getMenu() {
      const [items, groups, options, components, promoCodes] = await Promise.all([
        selectAll<MenuItemRow>("menu_items"),
        selectAll<OptionGroupRow>("option_groups"),
        selectAll<OptionRow>("options"),
        selectAll<ComboComponentRow>("combo_components"),
        selectAll<PromoCodeRow>("promo_codes"),
      ]);
      return menuFromRows({ items, groups, options, components, promoCodes }, VAT_RATES_DE_2026);
    },

    async getSlotUsage(from, to): Promise<Booked> {
      const result = await client
        .from("slots")
        .select("*")
        .gte("starts_at", from.toISOString())
        .lt("starts_at", to.toISOString())
        .order("starts_at");
      const usage = new Map<number, SlotUsage>();
      for (const row of dataOf<SlotRow[]>("select slots", result)) {
        usage.set(new Date(row.starts_at).getTime(), {
          booked: row.booked,
          capacity: row.capacity,
        });
      }
      return usage;
    },

    async placeHold(order: NewOrder, capacity, holdExpiresAt) {
      const result = await client.rpc("place_hold", {
        p_order: {
          slot_start: order.slotStart.toISOString(),
          customer_name: order.customerName,
          lines: order.lines,
          receipt: order.receipt,
          item_count: order.itemCount,
          total_cents: order.totalCents,
          promo_code: order.promoCode,
          pickup_code: order.pickupCode,
        },
        p_capacity: capacity,
        p_hold_expires_at: holdExpiresAt.toISOString(),
      });
      return orderFromRow(dataOf<OrderRow>("place_hold", result));
    },

    async getOrder(id) {
      const result = await client.from("orders").select("*").eq("id", id).maybeSingle();
      return orderOrNull(dataOf<OrderRow | null>("select order", result));
    },

    async findOrderByPickupCode(code) {
      const result = await client.from("orders").select("*").eq("pickup_code", code).maybeSingle();
      return orderOrNull(dataOf<OrderRow | null>("select order by pickup code", result));
    },

    async listOrders(from, to) {
      const result = await client
        .from("orders")
        .select("*")
        .gte("slot_start", from.toISOString())
        .lt("slot_start", to.toISOString())
        .order("slot_start")
        .order("created_at");
      return dataOf<OrderRow[]>("select orders", result).map(orderFromRow);
    },

    // The conditional UPDATE of §8.2: one statement, `WHERE id = $1 AND status IN (…)`.
    async transition(id, from, to, at, patch: TransitionPatch = {}) {
      const result = await client
        .from("orders")
        .update({
          status: to,
          [STAMP_COLUMN[to]]: at.toISOString(),
          ...(patch.stripePaymentIntentId === undefined
            ? {}
            : { stripe_payment_intent_id: patch.stripePaymentIntentId }),
        })
        .eq("id", id)
        .in("status", typeof from === "string" ? [from] : from)
        .select();
      const [row] = dataOf<OrderRow[]>("transition", result);
      return row === undefined ? null : orderFromRow(row);
    },

    async releaseHold(id, status, reason, now) {
      const result = await client.rpc("release_hold", {
        p_order_id: id,
        p_status: status,
        p_reason: reason,
        p_now: now.toISOString(),
      });
      return orderOrNull(dataOf<OrderRow | { id: null }>("release_hold", result));
    },

    async releaseExpiredHolds(now) {
      const result = await client.rpc("release_expired_holds", { p_now: now.toISOString() });
      return dataOf<OrderRow[]>("release_expired_holds", result).map(orderFromRow);
    },

    async reserveForPaid(id, capacity, paymentIntentId, now) {
      const result = await client.rpc("reserve_for_paid", {
        p_order_id: id,
        p_capacity: capacity,
        p_payment_intent_id: paymentIntentId,
        p_now: now.toISOString(),
      });
      return orderFromRow(dataOf<OrderRow>("reserve_for_paid", result));
    },

    // M5 adds the URL's column; until then the session id is what is stored (the contract pins only it).
    async setCheckout(id, sessionId, _checkoutUrl) {
      const result = await client
        .from("orders")
        .update({ stripe_session_id: sessionId })
        .eq("id", id);
      dataOf("set checkout", result);
    },

    async recordStripeEvent(id, type, orderId) {
      const { error } = await client.from("stripe_events").insert({ id, type, order_id: orderId });
      if (error?.code === UNIQUE_VIOLATION) return false;
      if (error !== null) throw failure("record stripe event", error);
      return true;
    },

    async deleteStripeEvent(id) {
      dataOf("delete stripe event", await client.from("stripe_events").delete().eq("id", id));
    },
  };
}
