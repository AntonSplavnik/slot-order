-- docs/design.md §5 Data model: the nine tables. All in `public`, times are timestamptz, money is integer
-- cents. RLS is enabled on every table with no policies (§3 Trust boundary): only the Worker, with the
-- service-role key (which bypasses RLS), reads or writes them; the anon key sees empty tables.

-- §5 settings: one row, ever (`CHECK (id = 1)`); core reads it as a SlotConfig (§6.2).
create table public.settings (
  id int primary key default 1 check (id = 1),
  timezone text not null,
  slot_minutes int not null check (slot_minutes > 0),
  capacity_per_slot int not null check (capacity_per_slot > 0),
  prep_minutes int not null check (prep_minutes >= 0),
  cutoff_minutes int not null check (cutoff_minutes >= 0),
  hold_minutes int not null check (hold_minutes > 0),
  max_days_ahead int not null check (max_days_ahead > 0),
  -- {"mon": [["11:00", "22:00"]], …, "sun": []}; its shape is checked by SlotConfigSchema (§5 Row mapping).
  opening_hours jsonb not null check (jsonb_typeof(opening_hours) = 'object')
);

-- §5 menu_items: prices are gross (§3 Money); inactive items are not listed and cannot be ordered.
create table public.menu_items (
  id text primary key,
  name text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  vat_category text not null check (vat_category in ('food', 'drink')),
  kind text not null check (kind in ('item', 'combo')),
  sort int not null,
  active boolean not null default true
);

-- §5 option_groups: only `kind = 'item'` rows have groups (kept so by the seed, not by a trigger).
create table public.option_groups (
  id text primary key,
  item_id text not null references public.menu_items (id) on delete cascade,
  name text not null,
  min_choices int not null check (min_choices >= 0),
  max_choices int not null check (max_choices >= 1),
  sort int not null,
  check (min_choices <= max_choices)
);

create index option_groups_item_id_idx on public.option_groups (item_id);

-- §5 options: a delta may be 0 or negative.
create table public.options (
  id text primary key,
  group_id text not null references public.option_groups (id) on delete cascade,
  name text not null,
  price_delta_cents int not null default 0,
  sort int not null
);

create index options_group_id_idx on public.options (group_id);

-- §5 combo_components: the items a combo is made of (§7.4 splits its VAT by them).
create table public.combo_components (
  combo_id text not null references public.menu_items (id) on delete cascade,
  item_id text not null references public.menu_items (id),
  quantity int not null default 1 check (quantity >= 1),
  sort int not null,
  primary key (combo_id, item_id),
  check (combo_id <> item_id)
);

create index combo_components_item_id_idx on public.combo_components (item_id);

-- §5 promo_codes: upper case (core's PromoCodeSchema: 2–20 letters or digits); a percent value is 0–100,
-- a fixed value is cents.
create table public.promo_codes (
  code text primary key check (code ~ '^[A-Z0-9]{2,20}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value int not null check (value >= 0 and (kind <> 'percent' or value <= 100)),
  active boolean not null default true,
  sort int not null
);

-- §5 slots, §3 Slot rows: created lazily by reserve_slot with the capacity of that moment; `booked`
-- counts held and paid items alike, and this CHECK is the last line against overbooking.
create table public.slots (
  starts_at timestamptz primary key,
  capacity int not null,
  booked int not null default 0,
  check (booked >= 0 and booked <= capacity)
);

-- §5 orders, §8 Order lifecycle. `lines` and `receipt` are the price snapshot (§3 Price snapshot, §7.5).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  status text not null
    check (status in ('held', 'paid', 'ready', 'picked_up', 'expired', 'cancelled')),
  slot_start timestamptz not null references public.slots (starts_at),
  customer_name text not null check (char_length(customer_name) between 1 and 60),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  item_count int not null check (item_count >= 1),
  total_cents int not null check (total_cents >= 0),
  promo_code text,
  -- §3 Pickup code: 8 characters of Crockford's base32 (no I, L, O, U), core's PickupCodeSchema.
  pickup_code text not null unique check (pickup_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  hold_expires_at timestamptz,
  cancel_reason text
    check (cancel_reason in ('stripe_failed', 'session_expired', 'refunded_slot_full')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  expired_at timestamptz,
  cancelled_at timestamptz,
  -- §3 Holds: a held order always has an expiry, so release_expired_holds sees every hold.
  check (status <> 'held' or hold_expires_at is not null)
);

create index orders_slot_start_idx on public.orders (slot_start);
-- For the cron's `status = 'held' and hold_expires_at < p_now` (§3 Holds, §8.4).
create index orders_status_hold_expires_at_idx on public.orders (status, hold_expires_at);

-- §5 stripe_events, §9.2: the primary key makes the webhook idempotent. `order_id` is not a foreign key:
-- an event for an unknown order is still recorded and answered with 200.
create table public.stripe_events (
  id text primary key,
  type text not null,
  order_id uuid,
  received_at timestamptz not null default now()
);

-- §3 Trust boundary: RLS on every table, no policies.
alter table public.settings enable row level security;
alter table public.menu_items enable row level security;
alter table public.option_groups enable row level security;
alter table public.options enable row level security;
alter table public.combo_components enable row level security;
alter table public.promo_codes enable row level security;
alter table public.slots enable row level security;
alter table public.orders enable row level security;
alter table public.stripe_events enable row level security;
