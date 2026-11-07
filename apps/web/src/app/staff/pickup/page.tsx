"use client";

import type { StaffOrder } from "@slot-order/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "@/components/browser";
import { TokenForm } from "@/components/TokenForm";
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
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.trim() !== "")
          router.push(`/staff/pickup?code=${encodeURIComponent(code.trim())}`);
      }}
    >
      <h1 className="text-xl font-semibold">Check in</h1>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Pickup code</span>
        <input
          type="text"
          autoCapitalize="characters"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono uppercase"
        />
      </label>
      <button
        type="submit"
        disabled={code.trim() === ""}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white disabled:bg-stone-300"
      >
        Check in
      </button>
    </form>
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

  if (result === null) return <p className="text-stone-500">Checking in {code}…</p>;
  if (!result.ok) {
    return (
      <div className="space-y-4">
        <p className="font-mono text-2xl font-bold tracking-wider">{code}</p>
        <p role="alert" className="text-red-700">
          {result.error}
        </p>
        <button
          type="button"
          onClick={() => void send()}
          className="w-full rounded-xl border border-orange-600 px-4 py-3 font-semibold text-orange-600"
        >
          Try again
        </button>
        <Link href="/staff" className="block text-center text-sm text-stone-500 underline">
          To the board
        </Link>
      </div>
    );
  }

  const { order } = result;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-orange-600 bg-orange-50 p-4">
        <h1 className="text-2xl font-bold">Picked up ✓</h1>
        <p className="font-mono text-xl font-bold tracking-wider">{order.pickupCode}</p>
        <p className="font-medium">
          {order.customerName} · {order.slotLabel}
        </p>
      </div>
      <ul className="space-y-1 rounded-xl border border-stone-200 bg-white p-4 text-sm">
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
      <Link href="/staff" className="block text-center text-sm text-stone-500 underline">
        To the board
      </Link>
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
