"use client";

import type { Cart, Receipt, SlotsResponse } from "@slot-order/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, berlinToday, browserStorage, messageOf } from "@/components/browser";
import {
  CardIcon,
  ChevronRightIcon,
  ClockIcon,
  MinusIcon,
  PersonIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "@/components/icons";
import { componentsText, optionSummary } from "@/components/menuText";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptView } from "@/components/ReceiptView";
import { Tile, tilePositions } from "@/components/Tile";
import {
  cardHeading,
  errorBox,
  focusRing,
  linkButton,
  pillButton,
  pinnedBar,
  primaryButton,
  secondaryButton,
  sectionBand,
  textInput,
} from "@/components/ui";
import { useCart } from "@/components/useCart";
import { ApiClientError } from "@/lib/api";
import { clearCart, itemCount, removeLine, setPromoCode, setQuantity } from "@/lib/cart";
import { errorText } from "@/lib/errors";
import { itemById } from "@/lib/menu";
import { formatCents } from "@/lib/money";
import { chip, dayLabel, dayStatusText, dayStrip } from "@/lib/slots";

// `/checkout`, the cart and the checkout in one page (docs/design.md §11.1, §11.6): the lines as rows with a
// tile and a stepper, rows for the pickup time (the day strip and the slot chips), the name and the promo code
// (through POST /quotes), the order summary, and the pinned Pay → POST /orders → Stripe's page.

/** `GET /slots` accepts at most 100 items (§10.1 `SlotsQuerySchema`); a bigger cart fails at POST /orders. */
const MAX_SLOT_QUERY_ITEMS = 100;
const NAME_MAX = 60;

type DayResult = { ok: true; slots: SlotsResponse } | { ok: false; error: string };
type RowId = "time" | "name" | "promo";

/** A row with an icon, a label, the current value and a chevron; its content opens inline below it. */
function ExpandRow({
  id,
  icon,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: RowId;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-200 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`row-${id}`}
        onClick={onToggle}
        className={`flex min-h-16 w-full items-center gap-4 py-3 text-left ${focusRing}`}
      >
        <span className="shrink-0 text-neutral-900">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{label}</span>
          {value}
        </span>
        <ChevronRightIcon
          className={`size-5 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div id={`row-${id}`} className="pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

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
  const [openRows, setOpenRows] = useState<Record<RowId, boolean>>({
    time: true,
    name: true,
    promo: false,
  });
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

  const header = <PageHeader title="Checkout" back="/" />;

  if (menuError !== null) {
    return (
      <>
        {header}
        <p role="alert" className={`${errorBox} mt-4 text-base`}>
          {menuError}
        </p>
      </>
    );
  }
  if (
    menu === null ||
    cart === null ||
    today === null ||
    cart.lines.length === 0 ||
    receipt === null
  ) {
    return (
      <>
        {header}
        <p className="pt-4 text-neutral-500">Loading…</p>
      </>
    );
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

  const positions = tilePositions(menu);
  const chosenSlot =
    selectedSlot === null || dayResult === undefined || !dayResult.ok
      ? undefined
      : dayResult.slots.slots.find((s) => s.start === selectedSlot);
  const toggle = (row: RowId) => setOpenRows((rows) => ({ ...rows, [row]: !rows[row] }));
  const promoOpen = openRows.promo || promoError !== null;

  return (
    <div>
      {header}

      <section aria-labelledby="cart-title" className="pt-3">
        <h2 id="cart-title" className={cardHeading}>
          Your order
        </h2>
        <ul className="mt-2 divide-y divide-neutral-200">
          {cart.lines.map((line, i) => {
            const priced = receipt.lines[i];
            const item = itemById(menu, line.itemId);
            const summary =
              item === undefined
                ? ""
                : item.kind === "combo"
                  ? componentsText(menu, item)
                  : optionSummary(item, line.optionIds);
            return (
              <li
                key={`${line.itemId}-${line.optionIds.join(",")}`}
                className="flex items-start gap-3 py-4"
              >
                {item !== undefined ? (
                  <Tile item={item} index={positions.get(item.id) ?? i} size="line" />
                ) : (
                  <span aria-hidden="true" className="size-16 shrink-0 rounded-xl bg-neutral-100" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug">{priced?.name ?? line.itemId}</p>
                    {priced !== undefined && (
                      <span className="shrink-0 tabular-nums">
                        {formatCents(priced.lineGrossCents)}
                      </span>
                    )}
                  </div>
                  {summary !== "" && <p className="mt-0.5 text-sm text-neutral-500">{summary}</p>}
                  <div className="mt-2 inline-flex items-center rounded-full bg-neutral-100">
                    {line.quantity <= 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove ${priced?.name ?? "line"}`}
                        onClick={() => setCart(removeLine(cart, i))}
                        className={`grid size-10 place-items-center rounded-full text-neutral-900 hover:bg-neutral-200 ${focusRing}`}
                      >
                        <TrashIcon className="size-[18px]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="One less"
                        onClick={() => setCart(setQuantity(cart, i, line.quantity - 1))}
                        className={`grid size-10 place-items-center rounded-full text-neutral-900 hover:bg-neutral-200 ${focusRing}`}
                      >
                        <MinusIcon className="size-[18px]" />
                      </button>
                    )}
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="One more"
                      disabled={line.quantity >= 20}
                      onClick={() => setCart(setQuantity(cart, i, line.quantity + 1))}
                      className={`grid size-10 place-items-center rounded-full text-neutral-900 enabled:hover:bg-neutral-200 disabled:text-neutral-300 ${focusRing}`}
                    >
                      <PlusIcon className="size-[18px]" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end pb-4">
          <Link href="/" className={pillButton}>
            <PlusIcon className="size-4" />
            Add items
          </Link>
        </div>
      </section>

      <div className={sectionBand} />

      <section aria-label="Pickup details">
        <ExpandRow
          id="time"
          icon={<ClockIcon className="size-6" />}
          label="Pickup time"
          open={openRows.time}
          onToggle={() => toggle("time")}
          value={
            chosenSlot !== undefined && selectedDay !== null ? (
              <span className="block text-sm text-green-700">
                {dayLabel(selectedDay, today)} · {chosenSlot.label}
              </span>
            ) : (
              <span className="block text-sm text-neutral-500">Choose a slot</span>
            )
          }
        >
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
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
                  aria-pressed={active && open}
                  onClick={() => {
                    setSelectedDay(day);
                    setSelectedSlot(null);
                  }}
                  className={`flex min-h-12 shrink-0 flex-col items-center justify-center rounded-full px-4 py-1.5 text-sm transition-colors ${
                    active && open
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-900 enabled:hover:bg-neutral-200"
                  } disabled:bg-neutral-50 disabled:text-neutral-400 ${focusRing}`}
                >
                  <span className="font-semibold whitespace-nowrap">{dayLabel(day, today)}</span>
                  {(result === undefined || status !== "open") && (
                    <span className="text-[11px] leading-tight">
                      {result === undefined
                        ? "…"
                        : status === undefined
                          ? "–"
                          : dayStatusText(status)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {dayResult === undefined ? (
              <p className="text-sm text-neutral-500">Loading the slots…</p>
            ) : !dayResult.ok ? (
              <p className="text-sm text-red-700">{dayResult.error}</p>
            ) : dayResult.slots.status !== "open" ? (
              <p className="text-sm text-neutral-500">No pickup on this day.</p>
            ) : dayResult.slots.slots.length === 0 ? (
              <p className="text-sm text-neutral-500">No slots on this day.</p>
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
                      aria-pressed={active}
                      title={view.hint ?? undefined}
                      onClick={() => setSelectedSlot(slot.start)}
                      className={`flex min-h-12 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-sm tabular-nums transition-colors ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white enabled:hover:border-neutral-900"
                      } disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-50 disabled:text-neutral-400 ${focusRing}`}
                    >
                      <span className="font-semibold">{view.label}</span>
                      {view.hint !== null && (
                        <span className="text-[10px] leading-tight">{view.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ExpandRow>

        <ExpandRow
          id="name"
          icon={<PersonIcon className="size-6" />}
          label="Your name"
          open={openRows.name}
          onToggle={() => toggle("name")}
          value={
            <span className="block truncate text-sm text-neutral-500">
              {trimmedName === "" ? "For the counter" : trimmedName}
            </span>
          }
        >
          <input
            id="customer-name"
            type="text"
            aria-label="Your name"
            autoComplete="given-name"
            maxLength={NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="For the counter"
            className={textInput}
          />
        </ExpandRow>

        <ExpandRow
          id="promo"
          icon={<TagIcon className="size-6" />}
          label="Promo code"
          open={promoOpen}
          onToggle={() => toggle("promo")}
          value={
            hasCode ? (
              <span className="block text-sm text-green-700">
                <span className="font-mono font-semibold">{cart.promoCode}</span> applied
              </span>
            ) : (
              <span className="block text-sm text-neutral-500">Add a code</span>
            )
          }
        >
          {hasCode ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-green-700">
                Code <span className="font-mono font-semibold">{cart.promoCode}</span> is applied.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPromoInput("");
                  setCart(setPromoCode(cart, ""));
                }}
                className={linkButton}
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
                aria-label="Promo code"
                autoCapitalize="characters"
                value={promoInput}
                onChange={(event) => setPromoInput(event.target.value)}
                placeholder="Code"
                className={`${textInput} min-w-0 flex-1 uppercase`}
              />
              <button
                type="submit"
                disabled={promoInput.trim() === ""}
                className={`${secondaryButton} min-h-12 shrink-0`}
              >
                Apply
              </button>
            </form>
          )}
          {promoError !== null && <p className="mt-2 text-sm text-red-700">{promoError}</p>}
        </ExpandRow>
      </section>

      <div className={sectionBand} />

      <section aria-labelledby="summary-title" className="space-y-3 py-5">
        <h2 id="summary-title" className={cardHeading}>
          Order summary
        </h2>
        {shown !== null ? (
          <ReceiptView receipt={shown} />
        ) : (
          <p className="text-sm text-neutral-500">{quoteError ?? "Applying the code…"}</p>
        )}
      </section>

      <div className={sectionBand} />

      <div className="flex items-center gap-4 py-4">
        <CardIcon className="size-6 shrink-0" />
        <p className="min-w-0">
          <span className="block font-semibold">Pay by card with Stripe</span>
          <span className="block text-sm text-neutral-500">test mode</span>
        </p>
      </div>

      <div className={pinnedBar}>
        <div className="mx-auto max-w-md space-y-2">
          {payError !== null && (
            <p role="alert" className={errorBox}>
              {payError}
            </p>
          )}
          {payError === null && !canPay && !paying && (
            <p className="text-center text-sm text-neutral-500">
              {!nameValid ? "Enter your name" : selectedSlot === null ? "Choose a pickup time" : ""}
            </p>
          )}
          <button
            type="button"
            disabled={!canPay}
            onClick={() => void pay()}
            className={`${primaryButton} w-full`}
          >
            {paying ? (
              "Starting payment…"
            ) : (
              <span>
                Pay
                {shown !== null && (
                  <span className="tabular-nums"> · {formatCents(shown.totalCents)}</span>
                )}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
