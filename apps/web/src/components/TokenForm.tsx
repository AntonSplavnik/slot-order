"use client";

import { useState } from "react";
import { card, primaryButton, textInput } from "@/components/ui";

// The staff token prompt (docs/design.md §3 Staff, §11.1 `/staff`): asked for once, kept in `localStorage`.

export function TokenForm({
  error,
  onSave,
}: {
  error: string | null;
  onSave: (token: string) => void;
}) {
  const [token, setToken] = useState("");
  return (
    <div className="flex min-h-[55dvh] items-center">
      <form
        className={`${card} w-full space-y-4 p-5`}
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim() !== "") onSave(token.trim());
        }}
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold">Staff</h1>
          <p className="mt-1 text-sm text-stone-600">
            Enter the staff token to see the orders and check customers in. It is kept on this
            device.
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Staff token</span>
          <input
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className={textInput}
          />
        </label>
        {error !== null && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={token.trim() === ""} className={`${primaryButton} w-full`}>
          Continue
        </button>
      </form>
    </div>
  );
}
