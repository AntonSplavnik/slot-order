"use client";

import { useState } from "react";
import { errorBox, primaryButton, textInput } from "@/components/ui";

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
        className="w-full space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim() !== "") onSave(token.trim());
        }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold">Staff token</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Enter the staff token to see the orders and check customers in. It is kept on this
            device.
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Staff token</span>
          <input
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className={textInput}
          />
        </label>
        {error !== null && (
          <p role="alert" className={errorBox}>
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
