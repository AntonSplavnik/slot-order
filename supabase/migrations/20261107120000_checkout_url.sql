-- M5 (docs/design.md §5 orders, §9.1): the Checkout Session's URL, stored next to its id by setCheckout
-- and shown in the order summary while the order is held.
alter table public.orders add column checkout_url text;
