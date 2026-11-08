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
  errorBox,
  focusRing,
  linkButton,
  pillButton,
  pinnedBar,
  press,
  primaryButton,
  sectionBand,
  sectionHeading,
  textInput,
} from "@/components/ui";
import { useCart } from "@/components/useCart";
import { ApiClientError } from "@/lib/api";
import { clearCart, itemCount, removeLine, setPromoCode, setQuantity } from "@/lib/cart";
import { errorText } from "@/lib/errors";
import { itemById } from "@/lib/menu";
import { formatCents } from "@/lib/money";
import { chip, dayLabel, dayStatusText, dayStrip } from "@/lib/slots";

// `/checkout`, the cart and the checkout in one page (docs/design.md §11.1, §11.6, §11.7): the X, the big title,
// the lines as rows with a tile and a stepper pill, rows for the pickup time (the day strip and the slot chips), the name and the promo code
// (through POST /quotes), the order summary, and the pinned Pay → POST /orders → Stripe's page.

/** `GET /slots` accepts at most 100 items (§10.1 `SlotsQuerySchema`); a bigger cart fails at POST /orders. */
const MAX_SLOT_QUERY_ITEMS = 100;
const NAME_MAX = 60;

/** The stepper's round buttons inside the 36 high, 92 wide pill. */
const stepButton = `grid size-9 place-items-center rounded-full text-ink disabled:text-mute ${press} ${focusRing}`;

type DayResult = { ok: true; slots: SlotsResponse } | { ok: false; error: string };
type RowId = "time" | "name" | "promo";

/** A row with an icon, a label, the current value and a chevron; its content opens inline below it. The label
 * carries an id (`row-<id>-label`) so the field inside can be named by it. */
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
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`row-${id}`}
        onClick={onToggle}
        className={`flex w-full items-center gap-4 py-4 text-left ${focusRing}`}
      >
        <span className="shrink-0 text-ink">{icon}</span>
        <span className="min-w-0 flex-1">
          <span id={`row-${id}-label`} className="block text-body-strong">
            {label}
          </span>
          {value}
        </span>
        <ChevronRightIcon className={`size-5 shrink-0 text-chevron ${open ? "rotate-90" : ""}`} />
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

  const header = (
    <>
      <PageHeader back={{ href: "/", label: "Back to the menu", icon: "close" }} />
      <h1 className="pt-2 text-title">Checkout</h1>
    </>
  );

  if (menuError !== null) {
    return (
      <>
        {header}
        <p role="alert" className={`${errorBox} mt-4`}>
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
        <p className="pt-4 text-body text-ink-3">Loading…</p>
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

      <section aria-label="Your order" className="pt-2">
        <ul className="divide-y divide-line">
          {cart.lines.map((line, i) => {
            const priced = receipt.lines[i];
            const item = itemById(menu, line.itemId);
            const name = priced?.name ?? line.itemId;
            const summary =
              item === undefined
                ? ""
                : item.kind === "combo"
                  ? componentsText(menu, item)
                  : optionSummary(item, line.optionIds);
            return (
              <li
                key={`${line.itemId}-${line.optionIds.join(",")}`}
                className="flex items-start gap-4 py-4"
              >
                {item !== undefined ? (
                  <Tile item={item} index={positions.get(item.id) ?? i} size="line" />
                ) : (
                  <span aria-hidden="true" className="size-18 shrink-0 rounded-xl bg-well" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong">{name}</p>
                  {priced !== undefined && (
                    <p className="mt-0.5 text-body-sm text-ink-3 tabular-nums">
                      {formatCents(priced.lineGrossCents)}
                    </p>
                  )}
                  {summary !== "" && (
                    <p className="mt-0.5 text-body-sm break-words text-ink-3">{summary}</p>
                  )}
                </div>
                <div className="mt-1 inline-flex h-9 w-[92px] shrink-0 items-center justify-between rounded-full bg-well">
                  {line.quantity <= 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove ${name} from the cart`}
                      onClick={() => setCart(removeLine(cart, i))}
                      className={stepButton}
                    >
                      <TrashIcon className="size-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Remove one"
                      onClick={() => setCart(setQuantity(cart, i, line.quantity - 1))}
                      className={stepButton}
                    >
                      <MinusIcon className="size-5" />
                    </button>
                  )}
                  <span className="text-body-strong tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    aria-label="Add one"
                    disabled={line.quantity >= 20}
                    onClick={() => setCart(setQuantity(cart, i, line.quantity + 1))}
                    className={stepButton}
                  >
                    <PlusIcon className="size-5" />
                  </button>
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
            <span className="block text-body-sm text-ink-2">
              {chosenSlot !== undefined && selectedDay !== null
                ? `${dayLabel(selectedDay, today)} • ${chosenSlot.label}`
                : "Choose a slot"}
            </span>
          }
        >
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {dayStrip(today).map((day) => {
              const result = days[day];
              const status = result?.ok === true ? result.slots.status : undefined;
              const open = status === "open";
              const active = day === selectedDay;
              const word =
                result === undefined
                  ? "…"
                  : status === undefined
                    ? "–"
                    : status === "open"
                      ? ""
                      : dayStatusText(status);
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
                  className={`inline-flex h-9 shrink-0 items-center rounded-full px-3 text-label whitespace-nowrap ${
                    active && open
                      ? "bg-ink text-white"
                      : "bg-well text-ink not-disabled:hover:bg-tag"
                  } disabled:cursor-not-allowed disabled:text-chevron ${press} ${focusRing}`}
                >
                  {dayLabel(day, today)}
                  {word !== "" && ` • ${word}`}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {dayResult === undefined ? (
              <p className="text-body-sm text-ink-3">Loading the slots…</p>
            ) : !dayResult.ok ? (
              <p className="text-body-sm text-negative">{dayResult.error}</p>
            ) : dayResult.slots.status !== "open" ? (
              <p className="text-body-sm text-ink-3">No pickup on this day.</p>
            ) : dayResult.slots.slots.length === 0 ? (
              <p className="text-body-sm text-ink-3">No slots on this day.</p>
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
                      className={`flex min-h-12 flex-col items-center justify-center rounded-lg border bg-white px-1 py-1.5 text-label tabular-nums ${
                        active
                          ? "border-ink ring-1 ring-ink ring-inset"
                          : "border-line not-disabled:hover:border-ink"
                      } disabled:cursor-not-allowed disabled:border-well disabled:bg-well disabled:text-chevron ${press} ${focusRing}`}
                    >
                      <span>{view.label}</span>
                      {view.hint !== null && <span className="text-caption">{view.hint}</span>}
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
            <span className="block text-body-sm break-words text-ink-2">
              {trimmedName === "" ? "For the counter" : trimmedName}
            </span>
          }
        >
          <input
            id="customer-name"
            name="name"
            type="text"
            aria-labelledby="row-name-label"
            autoComplete="given-name"
            enterKeyHint="next"
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
              <span className="block text-label text-green-text">{cart.promoCode} applied</span>
            ) : (
              <span className="block text-body-sm text-ink-2">Add a code</span>
            )
          }
        >
          {hasCode ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-label text-green-text">Code {cart.promoCode} is applied.</p>
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
                id="promo-code"
                name="promo"
                type="text"
                aria-labelledby="row-promo-label"
                aria-invalid={promoError !== null ? true : undefined}
                aria-describedby={promoError !== null ? "promo-error" : undefined}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="done"
                value={promoInput}
                onChange={(event) => setPromoInput(event.target.value)}
                placeholder="Code"
                className={`${textInput} min-w-0 flex-1 uppercase`}
              />
              <button
                type="submit"
                disabled={promoInput.trim() === ""}
                className={`inline-flex h-12 shrink-0 items-center rounded-lg bg-well px-4 text-label text-ink not-disabled:hover:bg-tag disabled:cursor-not-allowed disabled:text-disabled-text ${press} ${focusRing}`}
              >
                Apply
              </button>
            </form>
          )}
          {promoError !== null && (
            <p id="promo-error" className="mt-2 text-body-sm text-negative">
              {promoError}
            </p>
          )}
        </ExpandRow>
      </section>

      <div className={sectionBand} />

      <section aria-labelledby="summary-title" className="py-4">
        <h2 id="summary-title" className={`mb-2 ${sectionHeading}`}>
          Order summary
        </h2>
        {shown !== null ? (
          <ReceiptView receipt={shown} />
        ) : (
          <p className="text-body-sm text-ink-3">{quoteError ?? "Applying the code…"}</p>
        )}
      </section>

      <div className={sectionBand} />

      <div className="flex items-center gap-4 py-4">
        <CardIcon className="size-6 shrink-0" />
        <p className="min-w-0">
          <span className="block text-body-strong">Pay by card with Stripe</span>
          <span className="block text-body-sm text-ink-2">test mode</span>
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
            <p className="text-center text-body-sm text-ink-3">
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
                  <span className="tabular-nums"> • {formatCents(shown.totalCents)}</span>
                )}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
