-- docs/design.md §5 Seed: the settings row, the made-up Goldhahn menu and the promo codes. Written from
-- the core fixtures `seedConfig` (packages/core/test/fixtures/slotConfigs.ts) and `seedMenu`
-- (packages/core/test/fixtures/menu.ts); `pnpm test:db` maps these rows onto them (§5 Row mapping), so the
-- two cannot drift. Prices are gross cents (§3 Money). `sort` of groups, options and components is their
-- order within their parent, as the fixture lists them.

-- Mon–Sat 11:00–22:00, Sunday closed; 15-minute slots of 20 items; prep 20 min, cut-off 5 min, hold 10 min;
-- today and the next 6 days.
insert into public.settings (
  id, timezone, slot_minutes, capacity_per_slot, prep_minutes, cutoff_minutes, hold_minutes,
  max_days_ahead, opening_hours
)
values (
  1, 'Europe/Berlin', 15, 20, 20, 5, 10, 7,
  '{
    "mon": [["11:00", "22:00"]],
    "tue": [["11:00", "22:00"]],
    "wed": [["11:00", "22:00"]],
    "thu": [["11:00", "22:00"]],
    "fri": [["11:00", "22:00"]],
    "sat": [["11:00", "22:00"]],
    "sun": []
  }'
);

-- A combo's VAT is split by its components (§7.4); its row says 'food' because the column is required.
insert into public.menu_items (id, name, description, price_cents, vat_category, kind, sort, active)
values
  ('half-chicken', 'Halbes Hähnchen', null, 890, 'food', 'item', 1, true),
  ('chicken-burger', 'Chicken Burger', null, 790, 'food', 'item', 2, true),
  ('chicken-wings', 'Chicken Wings, 6 pieces', null, 650, 'food', 'item', 3, true),
  ('fries', 'Fries', null, 350, 'food', 'item', 4, true),
  ('coleslaw', 'Coleslaw', null, 290, 'food', 'item', 5, true),
  ('ayran', 'Ayran', null, 250, 'drink', 'item', 6, true),
  ('cola', 'Cola 0.33 l', null, 290, 'drink', 'item', 7, true),
  ('water', 'Water 0.5 l', null, 250, 'drink', 'item', 8, true),
  ('burger-menu', 'Burger Menu', null, 1290, 'food', 'combo', 9, true),
  ('wings-menu', 'Wings Menu', null, 1190, 'food', 'combo', 10, true);

insert into public.option_groups (id, item_id, name, min_choices, max_choices, sort)
values
  ('chicken-burger-size', 'chicken-burger', 'Size', 1, 1, 1),
  ('chicken-burger-sauce', 'chicken-burger', 'Sauce', 0, 2, 2),
  ('chicken-wings-heat', 'chicken-wings', 'Heat', 1, 1, 1),
  ('fries-size', 'fries', 'Size', 1, 1, 1);

insert into public.options (id, group_id, name, price_delta_cents, sort)
values
  ('burger-regular', 'chicken-burger-size', 'regular', 0, 1),
  ('burger-large', 'chicken-burger-size', 'large', 150, 2),
  ('sauce-garlic', 'chicken-burger-sauce', 'garlic', 0, 1),
  ('sauce-chili', 'chicken-burger-sauce', 'chili', 0, 2),
  ('sauce-honey-mustard', 'chicken-burger-sauce', 'honey mustard', 0, 3),
  ('wings-mild', 'chicken-wings-heat', 'mild', 0, 1),
  ('wings-hot', 'chicken-wings-heat', 'hot', 0, 2),
  ('fries-regular', 'fries-size', 'regular', 0, 1),
  ('fries-large', 'fries-size', 'large', 100, 2);

-- Burger Menu 12.90 (standalone 14.30), Wings Menu 11.90 (standalone 12.90).
insert into public.combo_components (combo_id, item_id, quantity, sort)
values
  ('burger-menu', 'chicken-burger', 1, 1),
  ('burger-menu', 'fries', 1, 2),
  ('burger-menu', 'cola', 1, 3),
  ('wings-menu', 'chicken-wings', 1, 1),
  ('wings-menu', 'fries', 1, 2),
  ('wings-menu', 'cola', 1, 3);

-- HAHN10: 10 % off; WELCOME3: 3.00 off; OLD: 50 % off, inactive.
insert into public.promo_codes (code, kind, value, active, sort)
values
  ('HAHN10', 'percent', 10, true, 1),
  ('WELCOME3', 'fixed', 300, true, 2),
  ('OLD', 'percent', 50, false, 3);
