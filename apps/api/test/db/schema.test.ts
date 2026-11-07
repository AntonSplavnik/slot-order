import { ORDER_STATUSES, VAT_RATES_DE_2026 } from "@slot-order/core";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { seedConfig } from "../../../../packages/core/test/fixtures/slotConfigs";
import { menuFromRows, slotConfigFromRow } from "../../src/db/rows";
import {
  closeDb,
  expectSqlState,
  HOLD_EXPIRY,
  holdPayload,
  type OrderRow,
  OTHER_SLOT,
  only,
  resetOrders,
  SLOT,
  service,
  sql,
  TABLES,
  UUID,
} from "./helpers";

// docs/design.md §5: the tables, RLS on each with no policies (§3 Trust boundary), the constraints the
// functions rely on, and the seed mapped through §5 Row mapping onto core's fixtures, so the seed and the
// fixtures cannot drift.

afterAll(closeDb);

describe("tables (§5)", () => {
  test("public holds the nine tables of §5 and nothing else", async () => {
    const rows = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`;
    expect(rows.map((row) => row.tablename).sort()).toEqual([...TABLES].sort());
  });

  test.each(TABLES)("%s has row level security enabled and no policies", async (table) => {
    const rows = await sql`
      select c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = ${table}`;
    expect([...rows]).toEqual([{ rls: true, policies: 0 }]);
  });
});

describe("settings (§5)", () => {
  test("has exactly one row, with id 1", async () => {
    expect([...(await sql`select id::int as id from settings`)]).toEqual([{ id: 1 }]);
  });

  test("a second row, a copy of the first with id 2, violates CHECK (id = 1): 23514", async () => {
    await expectSqlState(
      sql`insert into settings
          select (jsonb_populate_record(s, '{"id": 2}')).* from settings s`,
      "23514",
    );
  });
});

describe("the seed maps onto the core fixtures (§5 Seed, Row mapping)", () => {
  /** A table's rows as the Worker reads them: service role, through PostgREST. */
  async function rowsOf(table: string, orderBy: string) {
    const { data, error } = await service.from(table).select("*").order(orderBy);
    if (error !== null) throw new Error(`reading ${table}: ${error.message}`);
    return data;
  }

  test("menuFromRows of the menu tables equals seedMenu", async () => {
    const [items, groups, options, components, promoCodes] = await Promise.all([
      rowsOf("menu_items", "sort"),
      rowsOf("option_groups", "sort"),
      rowsOf("options", "sort"),
      rowsOf("combo_components", "sort"),
      rowsOf("promo_codes", "sort"),
    ]);
    const menu = menuFromRows(
      { items, groups, options, components, promoCodes },
      VAT_RATES_DE_2026,
    );
    expect(menu).toEqual(seedMenu);
  });

  test("slotConfigFromRow of the settings row equals seedConfig", async () => {
    const { data, error } = await service.from("settings").select("*").single();
    expect(error).toBeNull();
    expect(slotConfigFromRow(data)).toEqual(seedConfig);
  });
});

describe("constraints of slots, orders and stripe_events (§5)", () => {
  /** An order written directly, with the columns `place_hold` sets (§5), in `slotStart`. */
  async function insertOrder(pickupCode: string, slotStart = SLOT): Promise<OrderRow> {
    const p = holdPayload(pickupCode);
    return only(
      await sql<OrderRow[]>`
        insert into orders (status, slot_start, customer_name, lines, receipt, item_count,
                            total_cents, promo_code, pickup_code, hold_expires_at)
        values ('held', ${slotStart}, ${p.customer_name}, ${sql.json(p.lines)},
                ${sql.json(p.receipt)}, ${p.item_count}, ${p.total_cents}, ${p.promo_code},
                ${p.pickup_code}, ${HOLD_EXPIRY})
        returning *`,
    );
  }

  /** The database's clock, read in a statement of its own. */
  async function dbClock(): Promise<Date> {
    return only(await sql<{ now: Date }[]>`select clock_timestamp() as now`).now;
  }

  beforeEach(async () => {
    await resetOrders();
    await sql`insert into slots (starts_at, capacity, booked) values (${SLOT}, 20, 3)`;
  });

  test("orders.status accepts every status of core's ORDER_STATUSES", async () => {
    const { id } = await insertOrder("AAAA0001");
    for (const status of ORDER_STATUSES) {
      await sql`update orders set status = ${status} where id = ${id}`;
      expect((await sql`select status from orders where id = ${id}`)[0]).toEqual({ status });
    }
  });

  test("orders.status rejects 'bogus': 23514", async () => {
    const { id } = await insertOrder("AAAA0001");
    await expectSqlState(sql`update orders set status = 'bogus' where id = ${id}`, "23514");
  });

  test("slots.booked stays within 0 and capacity: capacity + 1 and −1 are 23514", async () => {
    await sql`update slots set booked = capacity where starts_at = ${SLOT}`;
    await sql`update slots set booked = 0 where starts_at = ${SLOT}`;
    await expectSqlState(
      sql`update slots set booked = capacity + 1 where starts_at = ${SLOT}`,
      "23514",
    );
    await expectSqlState(sql`update slots set booked = -1 where starts_at = ${SLOT}`, "23514");
  });

  test("stripe_events.id is the primary key: the same event twice is 23505", async () => {
    const insertEvent = () => sql`
      insert into stripe_events (id, type, order_id, received_at)
      values ('evt_test_1', 'checkout.session.completed', null, ${HOLD_EXPIRY})`;
    await insertEvent();
    await expectSqlState(insertEvent(), "23505");
  });

  test("orders.pickup_code is unique: 23505", async () => {
    await insertOrder("AAAA0001");
    await expectSqlState(insertOrder("AAAA0001"), "23505");
  });

  test("orders.stripe_session_id is unique: 23505", async () => {
    const first = await insertOrder("AAAA0001");
    const second = await insertOrder("AAAA0002");
    await sql`update orders set stripe_session_id = 'cs_test_1' where id = ${first.id}`;
    await expectSqlState(
      sql`update orders set stripe_session_id = 'cs_test_1' where id = ${second.id}`,
      "23505",
    );
  });

  test("orders.slot_start references slots: an order in a slot without a row is 23503", async () => {
    await expectSqlState(insertOrder("AAAA0001", OTHER_SLOT), "23503");
  });

  test("orders.id defaults to a UUID and orders.created_at to now", async () => {
    const before = await dbClock();
    const order = await insertOrder("AAAA0001");
    const after = await dbClock();
    expect(order.id).toMatch(UUID);
    expect(order.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
