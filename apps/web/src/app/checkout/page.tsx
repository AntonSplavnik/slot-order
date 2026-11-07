"use client";

import type { Cart, Receipt, SlotsResponse } from "@slot-order/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, berlinToday, browserStorage, messageOf } from "@/components/browser";
import { ReceiptView } from "@/components/ReceiptView";
import { useCart } from "@/components/useCart";
import { ApiClientError } from "@/lib/api";
import { clearCart, itemCount, removeLine, setPromoCode, setQuantity } from "@/lib/cart";
import { errorText } from "@/lib/errors";
import { chip, dayLabel, dayStatusText, dayStrip } from "@/lib/slots";

// `/checkout`, slot and pay (docs/design.md §11.1): the lines with steppers, the name, the day strip with each
// day's status, the chosen day's slots as chips, the promo code through POST /quotes, the receipt, and Pay →
// POST /orders → Stripe's page.

/** `GET /slots` accepts at most 100 items (§10.1 `SlotsQuerySchema`); a bigger cart fails at POST /orders. */
const MAX_SLOT_QUERY_ITEMS = 100;
const NAME_MAX = 60;

type DayResult = { ok: true; slots: SlotsResponse } | { ok: false; error: string };

/** The key of a priced cart: a quote answers for exactly this cart. */
function cartKey(cart: Cart): string {
  return JSON.stringify(cart);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { menu, menuError, cart, receipt, setCart } = useCart();

  const [today, setToday] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, DayResult>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ key: string; receipt: Receipt } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const slotRequest = useRef(0);

  // Today in Berlin, read on the client only (the server render shows the loading state).
  useEffect(() => setToday(berlinToday()), []);

  // An empty cart sends the customer back to the menu (§11.1).
  useEffect(() => {
    if (cart !== null && cart.lines.length === 0) router.replace("/");
  }, [cart, router]);

  const items = cart === null ? 0 : itemCount(cart);

  // One GET /slots per day of the strip, all at once; the newest answer wins.
  const loadSlots = useCallback(async () => {
    if (today === null || items === 0) return;
    const request = ++slotRequest.current;
    const strip = dayStrip(today);
    const query = Math.min(items, MAX_SLOT_QUERY_ITEMS);
    const results = await Promise.all(
      strip.map(async (day): Promise<[string, DayResult]> => {
        try {
          return [day, { ok: true, slots: await api.slots(day, query) }];
        } catch (error) {
          return [day, { ok: false, error: messageOf(error) }];
        }
      }),
    );
    if (request !== slotRequest.current) return;
    const next = Object.fromEntries(results);
    setDays(next);
    // The first open day with a bookable slot, unless the customer chose one.
    setSelectedDay(
      (chosen) =>
        chosen ??
        strip.find((day) => {
          const result = next[day];
          return result?.ok === true && result.slots.slots.some((s) => s.bookable);
        }) ??
        today,
    );
    // A chosen slot that is no longer bookable is dropped.
    setSelectedSlot((chosen) => {
      if (chosen === null) return null;
      const stillBookable = Object.values(next).some(
        (result) => result.ok && result.slots.slots.some((s) => s.start === chosen && s.bookable),
      );
      return stillBookable ? chosen : null;
    });
  }, [today, items]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  // While a code is set, the receipt comes from POST /quotes (§11.1); an invalid code is dropped and named.
  useEffect(() => {
    if (cart === null || cart.promoCode === undefined || cart.lines.length === 0) return;
    let cancelled = false;
    const key = cartKey(cart);
    setQuoteError(null);
    api.quote(cart).then(
      (quoted) => {
        if (!cancelled) setQuote({ key, receipt: quoted });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.code === "promo_invalid") {
          setPromoError(errorText("promo_invalid"));
          setCart(setPromoCode(cart, ""));
        } else {
          setQuoteError(messageOf(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cart, setCart]);

  if (menuError !== null) return <p className="text-red-700">{menuError}</p>;
  if (
    menu === null ||
    cart === null ||
    today === null ||
    cart.lines.length === 0 ||
    receipt === null
  ) {
    return <p className="text-stone-500">Loading…</p>;
  }

  const hasCode = cart.promoCode !== undefined;
  const quoted = hasCode && quote?.key === cartKey(cart) ? quote.receipt : null;
  const shown = hasCode ? quoted : receipt;
  const dayResult = selectedDay === null ? undefined : days[selectedDay];
  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= NAME_MAX;
  const canPay = nameValid && selectedSlot !== null && !paying && shown !== null;

  async function pay(): Promise<void> {
    if (cart === null || selectedSlot === null || !nameValid) return;
    setPaying(true);
    setPayError(null);
    try {
      const { order, checkoutUrl } = await api.createOrder({
        lines: cart.lines,
        ...(cart.promoCode === undefined ? {} : { promoCode: cart.promoCode }),
        slotStart: selectedSlot,
        customerName: trimmedName,
      });
      // The cart is cleared in storage only: the state stays, so this page does not bounce to the menu
      // before the browser leaves for Stripe.
      clearCart(browserStorage());
      window.location.assign(checkoutUrl ?? `/orders/${order.id}`);
    } catch (error) {
      setPayError(messageOf(error));
      setPaying(false);
      if (error instanceof ApiClientError && error.status === 409) {
        setSelectedSlot(null);
        void loadSlots();
      }
      if (error instanceof ApiClientError && error.code === "promo_invalid") {
        setCart(setPromoCode(cart, ""));
      }
    }
  }

  return (
    <div className="space-y-7">
      <h1 className="text-2xl font-bold">Checkout</h1>

      <section aria-labelledby="cart-title" className="space-y-2">
        <h2 id="cart-title" className="text-lg font-semibold">
          Your order
        </h2>
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {cart.lines.map((line, i) => {
            const priced = receipt.lines[i];
            return (
              <li
                key={`${line.itemId}-${line.optionIds.join(",")}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{priced?.name ?? line.itemId}</p>
                  {priced !== undefined && priced.optionNames.length > 0 && (
                    <p className="text-sm text-stone-500">{priced.optionNames.join(", ")}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setCart(removeLine(cart, i))}
                    className="text-xs text-stone-500 underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="One less"
                    onClick={() => setCart(setQuantity(cart, i, line.quantity - 1))}
                    className="size-8 rounded-full border border-stone-300"
                  >
                    −
                  </button>
                  <span className="w-5 text-center tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    aria-label="One more"
                    disabled={line.quantity >= 20}
                    onClick={() => setCart(setQuantity(cart, i, line.quantity + 1))}
                    className="size-8 rounded-full border border-stone-300 disabled:text-stone-300"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="name-title" className="space-y-2">
        <h2 id="name-title" className="text-lg font-semibold">
          Your name
        </h2>
        <input
          type="text"
          autoComplete="given-name"
          maxLength={NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="For the counter"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
        />
      </section>

      <section aria-labelledby="slot-title" className="space-y-3">
        <h2 id="slot-title" className="text-lg font-semibold">
          Pickup time
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {dayStrip(today).map((day) => {
            const result = days[day];
            const status = result?.ok === true ? result.slots.status : undefined;
            const open = status === "open";
            const active = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                disabled={!open}
                onClick={() => {
                  setSelectedDay(day);
                  setSelectedSlot(null);
                }}
                className={`flex min-w-20 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm ${
                  active && open
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-stone-200 bg-white"
                } disabled:bg-stone-100 disabled:text-stone-400`}
              >
                <span className="font-medium">{dayLabel(day, today)}</span>
                <span className="text-xs">
                  {result === undefined ? "…" : status === undefined ? "–" : dayStatusText(status)}
                </span>
              </button>
            );
          })}
        </div>

        {dayResult === undefined ? (
          <p className="text-sm text-stone-500">Loading the slots…</p>
        ) : !dayResult.ok ? (
          <p className="text-sm text-red-700">{dayResult.error}</p>
        ) : dayResult.slots.status !== "open" ? (
          <p className="text-sm text-stone-500">No pickup on this day.</p>
        ) : dayResult.slots.slots.length === 0 ? (
          <p className="text-sm text-stone-500">No slots on this day.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {dayResult.slots.slots.map((slot) => {
              const view = chip(slot);
              const active = slot.start === selectedSlot;
              return (
                <button
                  key={slot.start}
                  type="button"
                  disabled={view.disabled}
                  title={view.hint ?? undefined}
                  onClick={() => setSelectedSlot(slot.start)}
                  className={`flex flex-col items-center rounded-lg border px-1 py-2 text-sm tabular-nums ${
                    active
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-stone-200 bg-white"
                  } disabled:bg-stone-100 disabled:text-stone-400`}
                >
                  <span className="font-medium">{view.label}</span>
                  {view.hint !== null && (
                    <span className="text-[10px] leading-tight">{view.hint}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="promo-title" className="space-y-2">
        <h2 id="promo-title" className="text-lg font-semibold">
          Promo code
        </h2>
        {hasCode ? (
          <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
            <span className="font-mono">{cart.promoCode}</span>
            <button
              type="button"
              onClick={() => {
                setPromoInput("");
                setCart(setPromoCode(cart, ""));
              }}
              className="text-sm text-stone-500 underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPromoError(null);
              setCart(setPromoCode(cart, promoInput));
            }}
          >
            <input
              type="text"
              autoCapitalize="characters"
              value={promoInput}
              onChange={(event) => setPromoInput(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 uppercase"
            />
            <button
              type="submit"
              disabled={promoInput.trim() === ""}
              className="rounded-lg border border-orange-600 px-4 font-medium text-orange-600 disabled:border-stone-300 disabled:text-stone-400"
            >
              Apply
            </button>
          </form>
        )}
        {promoError !== null && <p className="text-sm text-red-700">{promoError}</p>}
      </section>

      <section aria-labelledby="receipt-title" className="space-y-2">
        <h2 id="receipt-title" className="text-lg font-semibold">
          Receipt
        </h2>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          {shown !== null ? (
            <ReceiptView receipt={shown} />
          ) : (
            <p className="text-sm text-stone-500">{quoteError ?? "Applying the code…"}</p>
          )}
        </div>
      </section>

      {payError !== null && (
        <p role="alert" className="text-sm text-red-700">
          {payError}
        </p>
      )}

      <button
        type="button"
        disabled={!canPay}
        onClick={() => void pay()}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white disabled:bg-stone-300"
      >
        {paying ? "Starting payment…" : "Pay"}
      </button>
      {!canPay && !paying && (
        <p className="text-center text-xs text-stone-500">
          {!nameValid ? "Enter your name" : selectedSlot === null ? "Choose a pickup time" : ""}
        </p>
      )}
    </div>
  );
}
