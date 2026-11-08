import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon, CloseIcon } from "@/components/icons";
import { focusRing, press } from "@/components/ui";

// The header of a page (docs/design.md §11.6, §11.7): 56 high, white, no border; an optional back arrow or X in
// a 44 × 44 hit area at the left, the title 16/20 500 centred (none on the checkout, which puts a big title
// under the X), an optional action at the right.

export function PageHeader({
  title,
  back,
  action,
}: {
  title?: string;
  /** Where the control at the left leads, its accessible name and its icon; no control without it. */
  back?: { href: string; label: string; icon?: "arrow" | "close" };
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 grid h-14 grid-cols-[3rem_1fr_3rem] items-center bg-white px-1">
      <span>
        {back !== undefined && (
          <Link
            href={back.href}
            aria-label={back.label}
            className={`grid size-11 place-items-center rounded-full text-ink hover:bg-well ${press} ${focusRing}`}
          >
            {back.icon === "close" ? (
              <CloseIcon className="size-6" />
            ) : (
              <ArrowLeftIcon className="size-6" />
            )}
          </Link>
        )}
      </span>
      {title !== undefined ? <h1 className="text-center text-body-strong">{title}</h1> : <span />}
      <span className="justify-self-end">{action}</span>
    </header>
  );
}
