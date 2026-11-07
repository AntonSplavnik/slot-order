"use client";

import type { OrderSummary } from "@slot-order/core";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, messageOf } from "@/components/browser";
import { ClockIcon } from "@/components/icons";
import { ReceiptView } from "@/components/ReceiptView";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { pickupUrl, qrSvg } from "@/lib/qr";
import { type StatusTone, shouldPoll, statusView } from "@/lib/status";

// `/orders/[id]`, the status (docs/design.md §11.1): polls GET /orders/:id every 3 s while held; paid and ready
// show the QR code of the staff pickup URL (§3 Pickup code), the code in letters, the slot and the receipt.

const POLL_MS = 3000;

/** The colour of the status card's top band, by tone. */
const TONE: Record<StatusTone, string> = {
  waiting: "bg-stone-100 text-stone-900",
  good: "bg-orange-600 text-white",
  done: "bg-stone-100 text-stone-900",
  bad: "bg-red-50 text-red-700",
};

/** The body text under the title, by tone (readable on the band's colour). */
const TONE_BODY: Record<StatusTone, string> = {
  waiting: "text-stone-600",
  good: "text-orange-50",
  done: "text-stone-600",
  bad: "text-red-700",
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
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700"
        >
          {error}
        </p>
        <Link href="/" className={`${secondaryButton} w-full`}>
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
    <div className="space-y-5">
      <div className={`${card} overflow-hidden`}>
        <div className={`px-5 py-5 ${TONE[view.tone]}`}>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {view.body !== "" && <p className={`mt-1 ${TONE_BODY[view.tone]}`}>{view.body}</p>}
        </div>

        {held && !confirming && order.checkoutUrl != null && (
          <div className="p-5">
            <a href={order.checkoutUrl} className={`${primaryButton} w-full`}>
              Continue to payment
            </a>
          </div>
        )}

        {showCode && (
          <section aria-label="Pickup code" className="space-y-4 px-5 py-6 text-center">
            {svg !== null && (
              <div
                className="mx-auto w-60 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"
                // Our own SVG, made by `qrcode` from the pickup URL (§11.2 `qr.ts`).
                // biome-ignore lint/security/noDangerouslySetInnerHtml: see above
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
            <p className="font-mono text-3xl font-bold tracking-widest">{code}</p>
            {order.status === "ready" && (
              <p className="text-sm text-stone-600">Show this at the counter</p>
            )}
            <p className="flex items-center justify-center gap-2 text-stone-600">
              <ClockIcon className="size-4 shrink-0 text-orange-600" />
              <span>
                Pickup at <span className="font-semibold text-stone-900">{order.slotLabel}</span>{" "}
                for {order.customerName}
              </span>
            </p>
          </section>
        )}

        {!showCode && order.status !== "held" && (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-stone-600">
            <ClockIcon className="size-4 shrink-0" />
            <span>
              Slot {order.slotLabel}, {order.customerName}
            </span>
          </p>
        )}
      </div>

      <section aria-labelledby="receipt-title" className={`${card} space-y-3 p-5`}>
        <h2 id="receipt-title" className="text-lg font-semibold">
          Receipt
        </h2>
        <ReceiptView receipt={order.receipt} />
      </section>

      {error !== null && <p className="text-center text-xs text-stone-500">{error}</p>}

      {(order.status === "expired" || order.status === "cancelled") && (
        <Link href="/" className={`${secondaryButton} w-full`}>
          Back to the menu
        </Link>
      )}
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
