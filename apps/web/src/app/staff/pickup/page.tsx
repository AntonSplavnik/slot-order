"use client";

import type { StaffOrder } from "@slot-order/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "@/components/browser";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { TokenForm } from "@/components/TokenForm";
import { card, linkButton, primaryButton, secondaryButton, textInput } from "@/components/ui";
import { useStaffToken } from "@/components/useStaffToken";
import { ApiClientError } from "@/lib/api";
import { errorText } from "@/lib/errors";

// `/staff/pickup?code=`, the check-in (docs/design.md §11.1): the QR code's target. With a token it calls
// POST /staff/pickup once and shows the order and "Picked up ✓", or the error's text with a retry.

type Result = { ok: true; order: StaffOrder } | { ok: false; error: string };

function CodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <div className="flex min-h-[55dvh] items-center">
      <form
        className={`${card} w-full space-y-4 p-5`}
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim() !== "")
            router.push(`/staff/pickup?code=${encodeURIComponent(code.trim())}`);
        }}
      >
        <h1 className="text-center text-xl font-semibold">Check in</h1>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Pickup code</span>
          <input
            type="text"
            autoCapitalize="characters"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${textInput} text-center font-mono text-xl tracking-widest uppercase`}
          />
        </label>
        <button type="submit" disabled={code.trim() === ""} className={`${primaryButton} w-full`}>
          Check in
        </button>
        <Link href="/staff" className={`${linkButton} w-full justify-center`}>
          To the board
        </Link>
      </form>
    </div>
  );
}

/** An order's lines, one per row. */
function Lines({ order }: { order: StaffOrder }) {
  return (
    <ul className="space-y-1 text-left text-sm text-stone-700">
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
  );
}

function Pickup({
  token,
  code,
  onUnauthorized,
}: {
  token: string;
  code: string;
  onUnauthorized: () => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  // One call per token and code: React's development double effect must not check in twice.
  const sent = useRef<string | null>(null);

  const send = useCallback(async () => {
    setResult(null);
    try {
      setResult({ ok: true, order: await api.staffPickup(token, code) });
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.code === "unauthorized") onUnauthorized();
      else setResult({ ok: false, error: messageOf(failure) });
    }
  }, [token, code, onUnauthorized]);

  useEffect(() => {
    const key = `${token}\n${code}`;
    if (sent.current === key) return;
    sent.current = key;
    void send();
  }, [token, code, send]);

  if (result === null) return <p className="text-center text-stone-500">Checking in {code}…</p>;
  if (!result.ok) {
    return (
      <div className="flex min-h-[55dvh] items-center">
        <div className="w-full space-y-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <p className="font-mono text-3xl font-bold tracking-widest">{code}</p>
          <p role="alert" className="font-medium text-red-700">
            {result.error}
          </p>
          <button type="button" onClick={() => void send()} className={`${primaryButton} w-full`}>
            Try again
          </button>
          <Link href="/staff" className={`${linkButton} w-full justify-center`}>
            To the board
          </Link>
        </div>
      </div>
    );
  }

  const { order } = result;
  return (
    <div className="flex min-h-[55dvh] items-center">
      <div className={`${card} w-full overflow-hidden text-center`}>
        <div className="space-y-2 bg-green-50 px-5 py-6 text-green-700">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-green-600 text-white">
            <CheckIcon className="size-9" />
          </span>
          <h1 className="text-2xl font-bold">Picked up ✓</h1>
        </div>
        <div className="space-y-3 px-5 py-5">
          <p className="font-mono text-3xl font-bold tracking-widest">{order.pickupCode}</p>
          <p className="flex items-center justify-center gap-2 font-medium">
            <span>{order.customerName}</span>
            <span className="text-stone-400">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ClockIcon className="size-4 text-stone-500" />
              {order.slotLabel}
            </span>
          </p>
          <div className="rounded-xl bg-stone-50 px-4 py-3">
            <Lines order={order} />
          </div>
          <Link href="/staff" className={`${secondaryButton} w-full`}>
            To the board
          </Link>
        </div>
      </div>
    </div>
  );
}

function CheckIn() {
  const code = useSearchParams().get("code")?.trim() ?? "";
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
  if (code === "") return <CodeForm />;
  return <Pickup token={token} code={code} onUnauthorized={unauthorized} />;
}

export default function PickupPage() {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
      <CheckIn />
    </Suspense>
  );
}
