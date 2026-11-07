import {
  type CancelReason,
  type Menu,
  type MenuItemKind,
  MenuSchema,
  type OpeningHours,
  type OrderStatus,
  type PricedLine,
  type PromoCode,
  type Receipt,
  type SlotConfig,
  SlotConfigSchema,
  type VatCategory,
  type VatRates,
} from "@slot-order/core";
import type { Order } from "../repo/types";

// The tables' rows as supabase-js returns them (docs/design.md §5): snake_case like the columns,
// timestamptz as ISO 8601 strings, jsonb parsed. And the pure mapping of §5 Row mapping onto core's types,
// validated with core's schemas so a bad seed fails loudly. No I/O in this file.

export type SettingsRow = {
  id: number;
  timezone: string;
  slot_minutes: number;
  capacity_per_slot: number;
  prep_minutes: number;
  cutoff_minutes: number;
  hold_minutes: number;
  max_days_ahead: number;
  opening_hours: OpeningHours;
};

export type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  vat_category: VatCategory;
  kind: MenuItemKind;
  sort: number;
  active: boolean;
};

export type OptionGroupRow = {
  id: string;
  item_id: string;
  name: string;
  min_choices: number;
  max_choices: number;
  sort: number;
};

export type OptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta_cents: number;
  sort: number;
};

export type ComboComponentRow = {
  combo_id: string;
  item_id: string;
  quantity: number;
  sort: number;
};

export type PromoCodeRow = {
  code: string;
  kind: PromoCode["kind"];
  value: number;
  active: boolean;
  sort: number;
};

export type SlotRow = {
  starts_at: string;
  capacity: number;
  booked: number;
};

export type OrderRow = {
  id: string;
  status: OrderStatus;
  slot_start: string;
  customer_name: string;
  lines: PricedLine[];
  receipt: Receipt;
  item_count: number;
  total_cents: number;
  promo_code: string | null;
  pickup_code: string;
  stripe_session_id: string | null;
  checkout_url: string | null;
  stripe_payment_intent_id: string | null;
  hold_expires_at: string | null;
  cancel_reason: CancelReason | null;
  created_at: string;
  paid_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
};

export type StripeEventRow = {
  id: string;
  type: string;
  order_id: string | null;
  received_at: string;
};

/** The menu tables' rows, in any order: `menuFromRows` orders them by `sort`. */
export type MenuRows = {
  items: readonly MenuItemRow[];
  groups: readonly OptionGroupRow[];
  options: readonly OptionRow[];
  components: readonly ComboComponentRow[];
  promoCodes: readonly PromoCodeRow[];
};

/** §5 Row mapping: the menu tables as core's `Menu`, every level ordered by `sort`. */
export function menuFromRows(rows: MenuRows, vatRates: VatRates): Menu {
  const optionsByGroup = groupBy(bySort(rows.options), (option) => option.group_id);
  const groupsByItem = groupBy(bySort(rows.groups), (group) => group.item_id);
  const componentsByCombo = groupBy(bySort(rows.components), (component) => component.combo_id);

  return MenuSchema.parse({
    items: bySort(rows.items).map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.description === null ? {} : { description: item.description }),
      priceCents: item.price_cents,
      vatCategory: item.vat_category,
      kind: item.kind,
      sort: item.sort,
      active: item.active,
      optionGroups: (groupsByItem.get(item.id) ?? []).map((group) => ({
        id: group.id,
        name: group.name,
        minChoices: group.min_choices,
        maxChoices: group.max_choices,
        options: (optionsByGroup.get(group.id) ?? []).map((option) => ({
          id: option.id,
          name: option.name,
          priceDeltaCents: option.price_delta_cents,
        })),
      })),
      components: (componentsByCombo.get(item.id) ?? []).map((component) => ({
        itemId: component.item_id,
        quantity: component.quantity,
      })),
    })),
    promoCodes: bySort(rows.promoCodes).map((promo) => ({
      code: promo.code,
      kind: promo.kind,
      value: promo.value,
      active: promo.active,
    })),
    vatRates,
  });
}

/** §5 Row mapping: the `settings` row as core's `SlotConfig` (§6.2). */
export function slotConfigFromRow(row: SettingsRow): SlotConfig {
  return SlotConfigSchema.parse({
    timezone: row.timezone,
    slotMinutes: row.slot_minutes,
    capacityPerSlot: row.capacity_per_slot,
    prepMinutes: row.prep_minutes,
    cutoffMinutes: row.cutoff_minutes,
    holdMinutes: row.hold_minutes,
    maxDaysAhead: row.max_days_ahead,
    openingHours: row.opening_hours,
  });
}

/** An `orders` row as the repository's `Order` (§10.2): camelCase, timestamptz as Dates, null kept. */
export function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    status: row.status,
    slotStart: new Date(row.slot_start),
    customerName: row.customer_name,
    lines: row.lines,
    receipt: row.receipt,
    itemCount: row.item_count,
    totalCents: row.total_cents,
    promoCode: row.promo_code,
    pickupCode: row.pickup_code,
    stripeSessionId: row.stripe_session_id,
    checkoutUrl: row.checkout_url,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    holdExpiresAt: dateOrNull(row.hold_expires_at),
    cancelReason: row.cancel_reason,
    createdAt: new Date(row.created_at),
    paidAt: dateOrNull(row.paid_at),
    readyAt: dateOrNull(row.ready_at),
    pickedUpAt: dateOrNull(row.picked_up_at),
    expiredAt: dateOrNull(row.expired_at),
    cancelledAt: dateOrNull(row.cancelled_at),
  };
}

function dateOrNull(timestamp: string | null): Date | null {
  return timestamp === null ? null : new Date(timestamp);
}

function bySort<T extends { sort: number }>(rows: readonly T[]): T[] {
  return rows.toSorted((a, b) => a.sort - b.sort);
}

/** The rows per key, each list in the order of `rows`. */
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row));
    if (list === undefined) groups.set(key(row), [row]);
    else list.push(row);
  }
  return groups;
}
