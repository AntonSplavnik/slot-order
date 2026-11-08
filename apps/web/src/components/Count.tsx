"use client";

import { type ReactNode, useRef } from "react";

// A shown count that ticks when it changes after mount (docs/design.md §11.9 M4): keyed on the value, so each new
// value remounts the span and replays `count-tick`; the value it mounted with never animates (a stored cart would
// make every badge jump at load). Reduced motion: none, the number itself changes.

export function Count({
  value,
  className = "",
  children,
}: {
  value: number;
  className?: string;
  /** What to show instead of the number (the round button's plus at 0). */
  children?: ReactNode;
}) {
  const initial = useRef(value);
  const tick = value !== initial.current ? "motion-safe:animate-count-tick" : "";
  return (
    <span key={value} className={`inline-block ${tick} ${className}`}>
      {children ?? value}
    </span>
  );
}
