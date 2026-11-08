import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/icons";
import { focusRing } from "@/components/ui";

// The compact header of a page (docs/design.md §11.6): an optional back arrow, the title centred, an optional
// action at the right.

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string;
  /** Where the back arrow leads; no arrow without it. */
  back?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-2 grid h-14 grid-cols-[3rem_1fr_3rem] items-center border-b border-neutral-200 bg-white px-2">
      <span>
        {back !== undefined && (
          <Link
            href={back}
            aria-label="Back"
            className={`grid size-11 place-items-center rounded-full hover:bg-neutral-100 ${focusRing}`}
          >
            <ArrowLeftIcon />
          </Link>
        )}
      </span>
      <h1 className="truncate text-center text-base font-semibold">{title}</h1>
      <span className="justify-self-end">{action}</span>
    </header>
  );
}
