"use client";

import type { OrderSummary } from "@slot-order/core";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, messageOf } from "@/components/browser";
import { ReceiptView } from "@/components/ReceiptView";
import { pickupUrl, qrSvg } from "@/lib/qr";
import { type StatusTone, shouldPoll, statusView } from "@/lib/status";

// `/orders/[id]`, the status (docs/design.md §11.1): polls GET /orders/:id every 3 s while held; paid and ready
// show the QR code of the staff pickup URL (§3 Pickup code), the code in letters, the slot and the receipt.

const POLL_MS = 3000;

const TONE: Record<StatusTone, string> = {
  waiting: "border-stone-200 bg-white",
  good: "border-orange-600 bg-orange-50",
  done: "border-stone-200 bg-white",
  bad: "border-red-200 bg-red-50",
};

function OrderStatus() {
  const { id } = useParams<{ id: string }>();
  const confirming = useSearchParams().get("paid") === "1";
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await api.order(id));
      setError(null);
    } catch (failure) {
      setError(messageOf(failure));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const polling = order !== null && shouldPoll(order.status);
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [polling, load]);

  const code = order?.pickupCode;
  useEffect(() => {
    if (code === undefined) return;
    let cancelled = false;
    qrSvg(pickupUrl(window.location.origin, code)).then((markup) => {
      if (!cancelled) setSvg(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (order === null) {
    return error === null ? (
      <p className="text-stone-500">Loading your order…</p>
    ) : (
      <div className="space-y-3">
        <p className="text-red-700">{error}</p>
        <Link href="/" className="text-orange-600 underline">
          Back to the menu
        </Link>
      </div>
    );
  }

  const view = statusView(order);
  const held = order.status === "held";
  const title = held && confirming ? "Confirming your payment…" : view.title;
  const showCode = code !== undefined && (order.status === "paid" || order.status === "ready");

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 ${TONE[view.tone]}`}>
        <h1 className="text-xl font-bold">{title}</h1>
        {view.body !== "" && <p className="mt-1 text-sm text-stone-600">{view.body}</p>}
        {held && !confirming && order.checkoutUrl != null && (
          <a
            href={order.checkoutUrl}
            className="mt-3 inline-block rounded-xl bg-orange-600 px-4 py-2 font-semibold text-white"
          >
            Continue to payment
          </a>
        )}
        {(order.status === "expired" || order.status === "cancelled") && (
          <Link href="/" className="mt-3 inline-block text-orange-600 underline">
            Back to the menu
          </Link>
        )}
      </div>

      {showCode && (
        <section aria-label="Pickup code" className="space-y-3 text-center">
          {svg !== null && (
            <div
              className="mx-auto w-56 rounded-xl bg-white p-2"
              // Our own SVG, made by `qrcode` from the pickup URL (§11.2 `qr.ts`).
              // biome-ignore lint/security/noDangerouslySetInnerHtml: see above
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
          <p className="font-mono text-4xl font-bold tracking-[0.2em]">{code}</p>
          <p className="text-sm text-stone-500">
            Pickup at <span className="font-semibold text-stone-900">{order.slotLabel}</span> for{" "}
            {order.customerName}
          </p>
        </section>
      )}

      {!showCode && order.status !== "held" && (
        <p className="text-sm text-stone-500">
          Slot {order.slotLabel}, {order.customerName}
        </p>
      )}

      <section aria-labelledby="receipt-title" className="space-y-2">
        <h2 id="receipt-title" className="text-lg font-semibold">
          Receipt
        </h2>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <ReceiptView receipt={order.receipt} />
        </div>
      </section>

      {error !== null && <p className="text-xs text-stone-500">{error}</p>}
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading your order…</p>}>
      <OrderStatus />
    </Suspense>
  );
}
