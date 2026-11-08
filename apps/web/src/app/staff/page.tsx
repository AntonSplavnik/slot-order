"use client";

import type { StaffBoard, StaffOrder } from "@slot-order/core";
import { useCallback, useEffect, useState } from "react";
import { api, berlinToday, messageOf } from "@/components/browser";
import { PageHeader } from "@/components/PageHeader";
import { TokenForm } from "@/components/TokenForm";
import {
  card,
  errorBox,
  pillButton,
  sectionHeading,
  smallPrimaryButton,
  smallSecondaryButton,
  tagShape,
} from "@/components/ui";
import { useStaffToken } from "@/components/useStaffToken";
import { ApiClientError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatCents } from "@/lib/money";

// `/staff`, the board (docs/design.md §11.1, §11.6 and §11.7 for the look): the day's slots from GET /staff/orders with booked/capacity, a card
// per order with Ready (paid) and Picked up (paid or ready); refreshed every 10 s; a date input for other days.

const REFRESH_MS = 10_000;

const STATUS_TEXT: Record<StaffOrder["status"], string> = {
  held: "Held",
  paid: "Paid",
  ready: "Ready",
  picked_up: "Picked up",
  expired: "Expired",
  cancelled: "Cancelled",
};

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === "unauthorized";
}

/** The status tag's colours in the Required tag's shape (§11.7: paid `ink`, ready green, cancelled red, the
 * rest grey). */
const STATUS_TAG: Record<StaffOrder["status"], string> = {
  held: `${tagShape} bg-tag text-ink-2`,
  paid: `${tagShape} bg-ink text-white`,
  ready: `${tagShape} bg-green text-white`,
  picked_up: `${tagShape} bg-tag text-ink-2`,
  expired: `${tagShape} bg-tag text-ink-2`,
  cancelled: `${tagShape} bg-negative-soft text-negative`,
};

function OrderCard({
  order,
  busy,
  onReady,
  onPickup,
}: {
  order: StaffOrder;
  busy: boolean;
  onReady: () => void;
  onPickup: () => void;
}) {
  const done = order.status === "picked_up";
  return (
    <li className={`px-4 py-3 ${done ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <span className="text-total tracking-[0.12em] tabular-nums">{order.pickupCode}</span>
          <span className="min-w-0 text-body-strong break-words">{order.customerName}</span>
        </div>
        <span className={`shrink-0 ${STATUS_TAG[order.status]}`}>{STATUS_TEXT[order.status]}</span>
      </div>
      <ul className="mt-1 text-body-sm text-ink-2">
        {order.lines.map((line, i) => (
          // The lines have no id; the index is their identity within one order.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i}>
            <span className="tabular-nums">{line.quantity} ×</span> {line.name}
            {line.optionNames.length > 0 && (
              <span className="text-ink-3"> ({line.optionNames.join(", ")})</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-caption text-ink-3 tabular-nums">
        {order.itemCount} {order.itemCount === 1 ? "item" : "items"} •{" "}
        {formatCents(order.totalCents)}
      </p>
      {(order.status === "paid" || order.status === "ready") && (
        <div className="mt-3 flex gap-2">
          {order.status === "paid" && (
            <button
              type="button"
              disabled={busy}
              onClick={onReady}
              className={`${smallPrimaryButton} flex-1`}
            >
              Ready
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onPickup}
            className={`${order.status === "ready" ? smallPrimaryButton : smallSecondaryButton} flex-1`}
          >
            Picked up
          </button>
        </div>
      )}
    </li>
  );
}

function Board({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [board, setBoard] = useState<StaffBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setDate(berlinToday()), []);

  const load = useCallback(async () => {
    if (date === null) return;
    try {
      const loaded = await api.staffBoard(token, date);
      setBoard(loaded);
      setError(null);
    } catch (failure) {
      if (isUnauthorized(failure)) onUnauthorized();
      else setError(messageOf(failure));
    }
  }, [token, date, onUnauthorized]);

  useEffect(() => {
    setBoard(null);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function act(order: StaffOrder, action: "ready" | "pickup"): Promise<void> {
    setBusy(order.id);
    try {
      if (action === "ready") await api.staffReady(token, order.id);
      else await api.staffPickup(token, order.pickupCode);
      setError(null);
    } catch (failure) {
      if (isUnauthorized(failure)) {
        onUnauthorized();
        return;
      }
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
    await load();
  }

  const orders = board?.slots.reduce((total, slot) => total + slot.orders.length, 0) ?? 0;

  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={`mr-auto ${sectionHeading}`}>Orders</h2>
        <input
          type="date"
          name="day"
          aria-label="Day"
          value={date ?? ""}
          onChange={(event) => {
            if (event.target.value !== "") setDate(event.target.value);
          }}
          className="h-9 rounded-full bg-well px-4 text-body text-ink focus:outline-none focus:ring-2 focus:ring-ink focus:ring-inset"
        />
        <button type="button" onClick={() => void load()} className={pillButton}>
          Refresh
        </button>
      </div>

      {error !== null && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}

      {board === null ? (
        <p className="text-body text-ink-3">Loading…</p>
      ) : board.status !== "open" && board.slots.length === 0 ? (
        <p className={`${card} px-4 py-6 text-center text-body text-ink-3`}>
          No service on this day.
        </p>
      ) : (
        <>
          <p className="text-body-sm text-ink-3">
            {orders} {orders === 1 ? "order" : "orders"}
          </p>
          <div className="space-y-2">
            {board.slots.map((slot) =>
              slot.orders.length === 0 ? (
                <section
                  key={slot.start}
                  aria-label={`Slot ${slot.label}`}
                  className="px-4 py-1 text-body-sm text-chevron"
                >
                  <h3 className="tabular-nums">
                    {slot.label} • {slot.booked}/{slot.capacity}
                  </h3>
                </section>
              ) : (
                <section
                  key={slot.start}
                  aria-label={`Slot ${slot.label}`}
                  className={`${card} overflow-hidden`}
                >
                  <h3 className="border-b border-line px-4 py-3 text-body-strong tabular-nums">
                    {slot.label}
                    <span className="text-body-sm text-ink-3">
                      {" "}
                      • {slot.booked}/{slot.capacity}
                    </span>
                  </h3>
                  <ul className="divide-y divide-line">
                    {slot.orders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        busy={busy === order.id}
                        onReady={() => void act(order, "ready")}
                        onPickup={() => void act(order, "pickup")}
                      />
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function StaffPage() {
  const { token, save, clear } = useStaffToken();
  const [formError, setFormError] = useState<string | null>(null);

  const unauthorized = useCallback(() => {
    clear();
    setFormError(errorText("unauthorized"));
  }, [clear]);

  return (
    <>
      <PageHeader title="Staff" back={{ href: "/", label: "Back to the menu" }} />
      {token === undefined ? (
        <p className="pt-4 text-body text-ink-3">Loading…</p>
      ) : token === null ? (
        <TokenForm
          error={formError}
          onSave={(next) => {
            setFormError(null);
            save(next);
          }}
        />
      ) : (
        <Board token={token} onUnauthorized={unauthorized} />
      )}
    </>
  );
}
