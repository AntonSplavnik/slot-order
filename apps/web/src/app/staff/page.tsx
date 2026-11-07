"use client";

import type { StaffBoard, StaffOrder } from "@slot-order/core";
import { useCallback, useEffect, useState } from "react";
import { api, berlinToday, messageOf } from "@/components/browser";
import { TokenForm } from "@/components/TokenForm";
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
    <li
      className={`rounded-xl border bg-white p-3 ${done ? "border-stone-200 opacity-60" : "border-stone-300"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-lg font-bold tracking-wider">{order.pickupCode}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            order.status === "ready" ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700"
          }`}
        >
          {STATUS_TEXT[order.status]}
        </span>
      </div>
      <p className="font-medium">{order.customerName}</p>
      <ul className="mt-1 text-sm">
        {order.lines.map((line, i) => (
          // The lines have no id; the index is their identity within one order.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i}>
            {line.quantity} × {line.name}
            {line.optionNames.length > 0 && (
              <span className="text-stone-500"> ({line.optionNames.join(", ")})</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-stone-500">
        {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
        {formatCents(order.totalCents)}
      </p>
      {(order.status === "paid" || order.status === "ready") && (
        <div className="mt-2 flex gap-2">
          {order.status === "paid" && (
            <button
              type="button"
              disabled={busy}
              onClick={onReady}
              className="flex-1 rounded-lg border border-orange-600 px-3 py-2 text-sm font-semibold text-orange-600 disabled:opacity-50"
            >
              Ready
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onPickup}
            className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Orders</h1>
        <input
          type="date"
          aria-label="Day"
          value={date ?? ""}
          onChange={(event) => {
            if (event.target.value !== "") setDate(event.target.value);
          }}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm"
        />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {board === null ? (
        <p className="text-stone-500">Loading…</p>
      ) : board.status !== "open" && board.slots.length === 0 ? (
        <p className="text-stone-500">No service on this day.</p>
      ) : (
        <>
          <p className="text-sm text-stone-500">
            {orders} {orders === 1 ? "order" : "orders"}
          </p>
          {board.slots.map((slot) => (
            <section key={slot.start} aria-label={`Slot ${slot.label}`} className="space-y-2">
              <h2 className="flex items-baseline justify-between border-b border-stone-200 pb-1">
                <span className="font-semibold tabular-nums">{slot.label}</span>
                <span className="text-sm text-stone-500 tabular-nums">
                  {slot.booked}/{slot.capacity}
                </span>
              </h2>
              {slot.orders.length > 0 && (
                <ul className="space-y-2">
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
              )}
            </section>
          ))}
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
