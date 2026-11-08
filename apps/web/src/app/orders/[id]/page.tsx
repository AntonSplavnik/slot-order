"use client";

import type { OrderSummary } from "@slot-order/core";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "@/components/browser";
import { ClockIcon, PersonIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptView } from "@/components/ReceiptView";
import {
  card,
  errorBox,
  primaryButton,
  secondaryButton,
  sectionBand,
  sectionHeading,
} from "@/components/ui";
import { pickupUrl, qrSvg } from "@/lib/qr";
import { shouldPoll, statusView } from "@/lib/status";

// `/orders/[id]`, the status (docs/design.md §11.1, §11.6, §11.7): polls GET /orders/:id every 3 s while held; the
// headline from `statusView`, a three-step progress line; paid and ready show the QR code of the staff pickup URL
// (§3 Pickup code) and the code in letters; the slot, the name and the receipt. The progress fills and the QR card
// enters by `@starting-style` (§11.9 M11, M12).

const POLL_MS = 3000;

/** The three steps of a paid order (§4): how many each status has reached. */
const STEPS = ["Paid", "Ready", "Picked up"] as const;
const REACHED: Partial<Record<OrderSummary["status"], number>> = {
  paid: 1,
  ready: 2,
  picked_up: 3,
};

/** The word under a grey progress line, for the statuses outside the three steps. */
const OFF_TRACK: Partial<Record<OrderSummary["status"], string>> = {
  held: "Waiting for payment",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** The fill's delay per step on the first render (80 ms after the one before, §11.9 M11). */
const FILL_DELAY = ["", "delay-80", "delay-160"] as const;

function Progress({ status }: { status: OrderSummary["status"] }) {
  const reached = REACHED[status] ?? 0;
  const off = OFF_TRACK[status];
  /** Steps reached at the first render fill one after another; a step reached later fills at once. */
  const initial = useRef(reached);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {STEPS.map((step, i) => (
          <span key={step} className="relative h-1 rounded-full bg-line">
            {i < reached && (
              <span
                className={`absolute inset-0 origin-left rounded-full bg-ink transition-[scale] duration-300 ease-out-strong motion-safe:starting:scale-x-0 motion-reduce:transition-none ${
                  i < initial.current ? FILL_DELAY[i] : ""
                }`}
              />
            )}
          </span>
        ))}
      </div>
      {off !== undefined ? (
        <p className="text-label text-ink-3">{off}</p>
      ) : (
        <ol className="grid grid-cols-3 text-label">
          {STEPS.map((step, i) => (
            <li
              key={step}
              aria-current={i === reached - 1 ? "step" : undefined}
              className={`${i === 1 ? "text-center" : i === 2 ? "text-right" : ""} ${
                i < reached ? "text-ink" : "text-chevron"
              }`}
            >
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A detail row: an icon and a line. */
function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-4 border-b border-line py-4 text-body last:border-b-0">
      <span className="shrink-0 text-ink">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

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

  const header = <PageHeader title="Your order" />;

  if (order === null) {
    return (
      <>
        {header}
        {error === null ? (
          <p className="pt-4 text-body text-ink-3">Loading your order…</p>
        ) : (
          <div className="space-y-4 pt-4">
            <p role="alert" className={errorBox}>
              {error}
            </p>
            <Link href="/" className={`${secondaryButton} w-full`}>
              Back to the menu
            </Link>
          </div>
        )}
      </>
    );
  }

  const view = statusView(order);
  const held = order.status === "held";
  const title = held && confirming ? "Confirming your payment…" : view.title;
  const showCode = code !== undefined && (order.status === "paid" || order.status === "ready");

  return (
    <div>
      {header}

      <div className="space-y-4 pt-4 pb-5">
        <div>
          <h2 className="text-title">{title}</h2>
          {view.body !== "" && <p className="mt-1 text-body-sm text-ink-3">{view.body}</p>}
        </div>
        <Progress status={order.status} />
      </div>

      {held && !confirming && order.checkoutUrl != null && (
        <a href={order.checkoutUrl} className={`${primaryButton} mb-5 w-full`}>
          Continue to payment
        </a>
      )}

      {showCode && (
        <section aria-label="Pickup code" className={`${card} mb-5 space-y-3 p-6 text-center`}>
          {svg !== null && (
            <div
              className="mx-auto w-56 transition-[scale,opacity] duration-250 ease-out-strong starting:opacity-0 motion-safe:starting:scale-97"
              // Our own SVG, made by `qrcode` from the pickup URL (§11.2 `qr.ts`).
              // biome-ignore lint/security/noDangerouslySetInnerHtml: see above
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
          <p className="text-code tabular-nums">{code}</p>
          {order.status === "ready" && (
            <p className="text-body-sm text-ink-3">Show this at the counter</p>
          )}
        </section>
      )}

      {!held && (
        <div className="mb-2">
          <Detail icon={<ClockIcon className="size-6" />}>
            Pickup at <span className="font-medium tabular-nums">{order.slotLabel}</span>
          </Detail>
          <Detail icon={<PersonIcon className="size-6" />}>{order.customerName}</Detail>
        </div>
      )}

      <div className={sectionBand} />

      <section aria-labelledby="summary-title" className="py-4">
        <h2 id="summary-title" className={`mb-2 ${sectionHeading}`}>
          Order summary
        </h2>
        <ReceiptView receipt={order.receipt} lines />
      </section>

      {error !== null && <p className="pb-3 text-center text-caption text-ink-3">{error}</p>}

      {(order.status === "expired" ||
        order.status === "cancelled" ||
        order.status === "picked_up") && (
        <Link href="/" className={`${secondaryButton} w-full`}>
          Back to the menu
        </Link>
      )}
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Your order" />
          <p className="pt-4 text-body text-ink-3">Loading your order…</p>
        </>
      }
    >
      <OrderStatus />
    </Suspense>
  );
}
