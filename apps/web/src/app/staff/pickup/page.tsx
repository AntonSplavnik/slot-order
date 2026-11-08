"use client";

import type { StaffOrder } from "@slot-order/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "@/components/browser";
import { CheckIcon, ClockIcon, PersonIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { TokenForm } from "@/components/TokenForm";
import {
  card,
  errorBox,
  linkButton,
  primaryButton,
  secondaryButton,
  textInput,
} from "@/components/ui";
import { useStaffToken } from "@/components/useStaffToken";
import { ApiClientError } from "@/lib/api";
import { errorText } from "@/lib/errors";

// `/staff/pickup?code=`, the check-in (docs/design.md §11.1, §11.6 and §11.7 for the look): the QR code's target. With a token it calls
// POST /staff/pickup once and shows the order and "Picked up ✓", or the error's text with a retry.

type Result = { ok: true; order: StaffOrder } | { ok: false; error: string };

function CodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <div className="flex min-h-[55dvh] items-center">
      <form
        className="w-full space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim() !== "")
            router.push(`/staff/pickup?code=${encodeURIComponent(code.trim())}`);
        }}
      >
        <h2 className="text-center text-title">Enter the pickup code</h2>
        <label className="block">
          <span className="mb-1.5 block text-label">Pickup code</span>
          <input
            type="text"
            name="code"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${textInput} text-center text-total tracking-[0.12em] uppercase`}
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
    <ul className="divide-y divide-line text-left text-body-sm text-ink-2">
      {order.lines.map((line, i) => (
        // The lines have no id; the index is their identity within one order.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <li key={i} className="py-3">
          <span className="font-medium text-ink tabular-nums">{line.quantity} ×</span> {line.name}
          {line.optionNames.length > 0 && (
            <span className="text-ink-3"> ({line.optionNames.join(", ")})</span>
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

  if (result === null)
    return <p className="pt-6 text-center text-body text-ink-3">Checking in {code}…</p>;
  if (!result.ok) {
    return (
      <div className="flex min-h-[55dvh] items-center">
        <div className="w-full space-y-4 text-center">
          <span
            aria-hidden="true"
            className="mx-auto grid size-16 place-items-center rounded-full bg-negative-soft text-title text-negative"
          >
            !
          </span>
          <p className="text-code break-all tabular-nums">{code}</p>
          <p role="alert" className={errorBox}>
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
      <div className="w-full space-y-4">
        <div className="space-y-2 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-green text-white">
            <CheckIcon className="size-9" />
          </span>
          <h2 className="text-title">Picked up ✓</h2>
          <p className="text-code tabular-nums">{order.pickupCode}</p>
        </div>
        <div className={`${card} px-4`}>
          <p className="flex items-center gap-4 border-b border-line py-4">
            <PersonIcon className="size-6 shrink-0" />
            <span className="min-w-0 text-body-strong break-words">{order.customerName}</span>
          </p>
          <p className="flex items-center gap-4 border-b border-line py-4 text-body tabular-nums">
            <ClockIcon className="size-6 shrink-0" />
            <span>Pickup at {order.slotLabel}</span>
          </p>
          <Lines order={order} />
        </div>
        <Link href="/staff" className={`${secondaryButton} w-full`}>
          To the board
        </Link>
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

  return (
    <>
      <PageHeader title="Check in" back={{ href: "/staff", label: "Back to the board" }} />
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
      ) : code === "" ? (
        <CodeForm />
      ) : (
        <Pickup token={token} code={code} onUnauthorized={unauthorized} />
      )}
    </>
  );
}

export default function PickupPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Check in" back={{ href: "/staff", label: "Back to the board" }} />
          <p className="pt-4 text-body text-ink-3">Loading…</p>
        </>
      }
    >
      <CheckIn />
    </Suspense>
  );
}
