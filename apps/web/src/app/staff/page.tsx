"use client";

import type { StaffBoard, StaffOrder } from "@slot-order/core";
import { useCallback, useEffect, useState } from "react";
import { api, berlinToday, messageOf } from "@/components/browser";
import { TokenForm } from "@/components/TokenForm";
import { card, secondaryButton, smallPrimaryButton } from "@/components/ui";
import { useStaffToken } from "@/components/useStaffToken";
import { ApiClientError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatCents } from "@/lib/money";

// `/staff`, the board (docs/design.md §11.1): the day's slots from GET /staff/orders with booked/capacity, a card
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

/** The status tag's colours (paid orange, ready green, picked up stone). */
const STATUS_TAG: Record<StaffOrder["status"], string> = {
  held: "bg-stone-100 text-stone-600",
  paid: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  ready: "bg-green-50 text-green-700 ring-1 ring-green-200",
  picked_up: "bg-stone-100 text-stone-500",
  expired: "bg-stone-100 text-stone-500",
  cancelled: "bg-red-50 text-red-700",
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
    <li className={`px-4 py-3 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-mono text-lg font-bold tracking-wider">{order.pickupCode}</span>
          <span className="truncate font-medium">{order.customerName}</span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TAG[order.status]}`}
        >
          {STATUS_TEXT[order.status]}
        </span>
      </div>
      <ul className="mt-1 text-sm text-stone-700">
        {order.lines.map((line, i) => (
          // The lines have no id; the index is their identity within one order.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i}>
            <span className="tabular-nums">{line.quantity} ×</span> {line.name}
            {line.optionNames.length > 0 && (
              <span className="text-stone-500"> ({line.optionNames.join(", ")})</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-stone-500 tabular-nums">
        {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
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
            className={`${smallPrimaryButton} flex-1`}
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Orders</h1>
        <input
          type="date"
          aria-label="Day"
          value={date ?? ""}
          onChange={(event) => {
            if (event.target.value !== "") setDate(event.target.value);
          }}
          className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base focus:border-orange-600 focus:ring-2 focus:ring-orange-600/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void load()}
          className={`${secondaryButton} px-3 py-2 text-sm`}
        >
          Refresh
        </button>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {board === null ? (
        <p className="text-stone-500">Loading…</p>
      ) : board.status !== "open" && board.slots.length === 0 ? (
        <p className={`${card} px-4 py-6 text-center text-stone-500`}>No service on this day.</p>
      ) : (
        <>
          <p className="text-sm text-stone-500">
            {orders} {orders === 1 ? "order" : "orders"}
          </p>
          <div className="space-y-2">
            {board.slots.map((slot) =>
              slot.orders.length === 0 ? (
                <section
                  key={slot.start}
                  aria-label={`Slot ${slot.label}`}
                  className="px-4 py-1 text-sm text-stone-400"
                >
                  <h2 className="tabular-nums">
                    {slot.label} · {slot.booked}/{slot.capacity}
                  </h2>
                </section>
              ) : (
                <section
                  key={slot.start}
                  aria-label={`Slot ${slot.label}`}
                  className={`${card} overflow-hidden`}
                >
                  <h2 className="border-b border-stone-200 bg-stone-50 px-4 py-2 font-semibold tabular-nums">
                    {slot.label}
                    <span className="font-normal text-stone-500">
                      {" "}
                      · {slot.booked}/{slot.capacity}
                    </span>
                  </h2>
                  <ul className="divide-y divide-stone-100">
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

  if (token === undefined) return <p className="text-stone-500">Loading…</p>;
  if (token === null) {
    return (
      <TokenForm
        error={formError}
        onSave={(next) => {
          setFormError(null);
          save(next);
        }}
      />
    );
  }
  return <Board token={token} onUnauthorized={unauthorized} />;
}
