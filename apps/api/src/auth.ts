import type { MiddlewareHandler } from "hono";
import { ApiError } from "./errors";

// Staff authentication (docs/design.md §10.4): `Authorization: Bearer <STAFF_TOKEN>` on every /staff/*
// request, compared in constant time; anything else is 401 `unauthorized`. CORS answers preflights before
// this runs (app.ts), because browsers send no token on them.

const BEARER = /^Bearer +(\S+) *$/i;
const encoder = new TextEncoder();

/** The token of a `Bearer` Authorization header; null for a missing header or any other scheme. */
export function bearerToken(header: string | undefined): string | null {
  return BEARER.exec(header ?? "")?.[1] ?? null;
}

/**
 * Whether `given` equals `expected`, in a time that depends only on `given`'s length: every byte of
 * `given` is compared, whatever the first difference, and a difference in length counts as one.
 */
export function constantTimeEqual(given: string, expected: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i += 1) {
    difference |= (a[i] ?? 0) ^ (b[i % Math.max(b.length, 1)] ?? 0);
  }
  return difference === 0;
}

/** The middleware on /staff/*: lets the request through only with the staff token. */
export function staffAuth(staffToken: string): MiddlewareHandler {
  return async (c, next) => {
    const token = bearerToken(c.req.header("Authorization"));
    if (token === null || staffToken === "" || !constantTimeEqual(token, staffToken)) {
      throw new ApiError("unauthorized");
    }
    await next();
  };
}
