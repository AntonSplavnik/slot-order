-- docs/design.md §5 SQL functions. All plpgsql and SECURITY INVOKER (the default): they run as the caller,
-- the service role, which the Worker uses through PostgREST (`supabase.rpc`). Each call is its own
-- transaction, so a RAISE rolls back everything the function did. Time is a parameter (`p_now`) wherever
-- the rules depend on it. Errors are `RAISE EXCEPTION '<code>'` (SQLSTATE P0001) with the codes
-- `invalid_items`, `slot_full`, `invalid_status`. `search_path` is empty, so every name is qualified.

-- §5 reserve_slot, §3 Slot rows and No overbooking: books `p_items` in the slot at `p_starts_at`,
-- creating its row with `p_capacity` on first use; an existing row keeps its capacity.
--
-- Concurrency: the INSERT … ON CONFLICT DO NOTHING lets exactly one caller create the row (the others
-- wait for that caller's transaction on the key, then do nothing). The single conditional UPDATE then
-- takes the row lock of that one slot: concurrent callers queue on it, and each re-evaluates
-- `booked + p_items <= capacity` against the row as the previous winner committed it (READ COMMITTED), so
-- the losers update nothing and raise `slot_full` instead of overbooking. No other lock is taken.
create function public.reserve_slot(p_starts_at timestamptz, p_items int, p_capacity int)
returns public.slots
language plpgsql
set search_path = ''
as $$
declare
  v_slot public.slots;
begin
  if p_items is null or p_items < 1 then
    raise exception 'invalid_items';
  end if;

  insert into public.slots (starts_at, capacity, booked)
  values (p_starts_at, p_capacity, 0)
  on conflict (starts_at) do nothing;

  update public.slots
  set booked = booked + p_items
  where starts_at = p_starts_at
    and booked + p_items <= capacity
  returning * into v_slot;

  if not found then
    raise exception 'slot_full';
  end if;

  return v_slot;
end;
$$;

-- §5 release_slot: gives `p_items` back to the slot; the CHECK on `slots.booked` keeps it at 0 or more.
-- Returns NULL when the slot has no row.
create function public.release_slot(p_starts_at timestamptz, p_items int)
returns public.slots
language plpgsql
set search_path = ''
as $$
declare
  v_slot public.slots;
begin
  if p_items is null or p_items < 1 then
    raise exception 'invalid_items';
  end if;

  update public.slots
  set booked = booked - p_items
  where starts_at = p_starts_at
  returning * into v_slot;

  return v_slot;
end;
$$;

-- §5 place_hold, §8.2 — → held: reserves the order's items and inserts the order in one transaction.
-- `p_order` keys: slot_start (ISO 8601 with offset), customer_name, lines, receipt, item_count,
-- total_cents, promo_code (or null), pickup_code. A bad payload fails the INSERT (NOT NULL or a CHECK),
-- which rolls the reservation back with it.
create function public.place_hold(p_order jsonb, p_capacity int, p_hold_expires_at timestamptz)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_slot_start timestamptz := (p_order ->> 'slot_start')::timestamptz;
  v_item_count int := (p_order ->> 'item_count')::int;
  v_order public.orders;
begin
  perform public.reserve_slot(v_slot_start, v_item_count, p_capacity);

  insert into public.orders (
    status, slot_start, customer_name, lines, receipt, item_count, total_cents, promo_code,
    pickup_code, hold_expires_at
  )
  values (
    'held',
    v_slot_start,
    p_order ->> 'customer_name',
    p_order -> 'lines',
    p_order -> 'receipt',
    v_item_count,
    (p_order ->> 'total_cents')::int,
    p_order ->> 'promo_code',
    p_order ->> 'pickup_code',
    p_hold_expires_at
  )
  returning * into v_order;

  return v_order;
end;
$$;

-- §5 release_hold, §8.2 held → expired | cancelled: the conditional UPDATE (`status = 'held'`) moves the
-- order and stamps `p_now`; only then are its items released. Returns NULL when nothing was released
-- (unknown id, or the order already moved on: callers treat that as done). Through PostgREST a NULL row
-- arrives as an object whose every field is null; the repository checks `id === null`.
create function public.release_hold(
  p_order_id uuid,
  p_status text,
  p_reason text default null,
  p_now timestamptz default now()
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if p_status is null or p_status not in ('expired', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  update public.orders
  set status = p_status,
      expired_at = case when p_status = 'expired' then p_now else expired_at end,
      cancelled_at = case when p_status = 'cancelled' then p_now else cancelled_at end,
      cancel_reason = p_reason,
      hold_expires_at = null
  where id = p_order_id
    and status = 'held'
  returning * into v_order;

  if not found then
    return null;
  end if;

  perform public.release_slot(v_order.slot_start, v_order.item_count);
  return v_order;
end;
$$;

-- §5 release_expired_holds, §3 Holds, §8.4 step 1: every held order with `hold_expires_at < p_now` (a hold
-- expiring exactly at p_now is still live), through release_hold, returned so the Worker can expire their
-- Stripe sessions.
--
-- FOR UPDATE SKIP LOCKED: each order is locked before it is released, so release_hold always finds it
-- still held and never returns NULL into the result. An order another transaction is moving right now
-- (the webhook paying it, or an overlapping cron run) is skipped rather than waited for: that transaction
-- decides it, and if it is still an expired hold afterwards, the next run (a minute later) releases it.
create function public.release_expired_holds(p_now timestamptz default now())
returns setof public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_held record;
begin
  for v_held in
    select id
    from public.orders
    where status = 'held'
      and hold_expires_at < p_now
    order by hold_expires_at
    for update skip locked
  loop
    return next public.release_hold(v_held.id, 'expired', null, p_now);
  end loop;

  return;
end;
$$;

-- §5 reserve_for_paid, §8.2 expired → paid, §8.4: the webhook's second chance for an order whose hold
-- expired while its customer paid. The conditional UPDATE (`status = 'expired'`) is the guard: no such
-- order, or any other status, is `invalid_status`. It also takes the order's row lock before the slot's,
-- the same order as release_hold. Then the items are booked again; `slot_full` rolls the UPDATE back, so
-- the order stays expired (and the webhook refunds, §9.3).
create function public.reserve_for_paid(
  p_order_id uuid,
  p_capacity int,
  p_payment_intent_id text,
  p_now timestamptz default now()
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set status = 'paid',
      paid_at = p_now,
      stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id
    and status = 'expired'
  returning * into v_order;

  if not found then
    raise exception 'invalid_status';
  end if;

  perform public.reserve_slot(v_order.slot_start, v_order.item_count, p_capacity);
  return v_order;
end;
$$;

-- §5 slot_booked_mismatches, §8.2 invariant: the slots whose `booked` differs from Σ `item_count` of
-- their held, paid, ready and picked-up orders. Empty when all is well. For tests and for operators.
create function public.slot_booked_mismatches()
returns table (starts_at timestamptz, booked int, counted bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  select s.starts_at, s.booked, coalesce(sum(o.item_count), 0)::bigint
  from public.slots s
  left join public.orders o
    on o.slot_start = s.starts_at
   and o.status in ('held', 'paid', 'ready', 'picked_up')
  group by s.starts_at, s.booked
  having s.booked <> coalesce(sum(o.item_count), 0)
  order by s.starts_at;
end;
$$;

-- §5 Privileges, §3 Trust boundary: Supabase grants EXECUTE on new functions to public, anon and
-- authenticated by default. Revoke it, so only the service role (the Worker) can call them.
revoke execute on function public.reserve_slot(timestamptz, int, int) from public, anon, authenticated;
revoke execute on function public.release_slot(timestamptz, int) from public, anon, authenticated;
revoke execute on function public.place_hold(jsonb, int, timestamptz) from public, anon, authenticated;
revoke execute on function public.release_hold(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.release_expired_holds(timestamptz) from public, anon, authenticated;
revoke execute on function public.reserve_for_paid(uuid, int, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.slot_booked_mismatches() from public, anon, authenticated;

grant execute on function public.reserve_slot(timestamptz, int, int) to service_role;
grant execute on function public.release_slot(timestamptz, int) to service_role;
grant execute on function public.place_hold(jsonb, int, timestamptz) to service_role;
grant execute on function public.release_hold(uuid, text, text, timestamptz) to service_role;
grant execute on function public.release_expired_holds(timestamptz) to service_role;
grant execute on function public.reserve_for_paid(uuid, int, text, timestamptz) to service_role;
grant execute on function public.slot_booked_mismatches() to service_role;
