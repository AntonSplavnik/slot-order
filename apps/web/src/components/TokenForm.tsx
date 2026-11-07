"use client";

import { useState } from "react";

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
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (token.trim() !== "") onSave(token.trim());
      }}
    >
      <h1 className="text-xl font-semibold">Staff</h1>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Staff token</span>
        <input
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2"
        />
      </label>
      {error !== null && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={token.trim() === ""}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white disabled:bg-stone-300"
      >
        Continue
      </button>
    </form>
  );
}
