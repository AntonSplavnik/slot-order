import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { focusRing } from "@/components/ui";
import "./globals.css";

// The frame of every screen (docs/design.md §11.1): a sticky top bar with the name, the page in a phone-wide
// column, the Staff link in the footer only. The menu page puts its cart badge into `#top-bar-action`.

export const metadata: Metadata = {
  title: "Goldhahn: order ahead",
  description: "Order halal chicken ahead and pick it up at your time slot.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ea580c" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-stone-50 text-base text-stone-900 antialiased">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-2.5">
            <Link href="/" className={`flex items-center gap-3 rounded-xl ${focusRing}`}>
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-xl bg-orange-600 text-lg font-bold text-white"
              >
                G
              </span>
              <span>
                <span className="block text-lg leading-tight font-bold tracking-tight">
                  Goldhahn
                </span>
                <span className="block text-xs text-stone-500">Order ahead, pick up on time</span>
              </span>
            </Link>
            <div id="top-bar-action" className="empty:hidden" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">{children}</main>
        <footer className="border-t border-stone-200">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 pt-4 pb-28 text-xs text-stone-500">
            <span>Goldhahn is a made-up restaurant; payments run in Stripe test mode.</span>
            <Link
              href="/staff"
              className={`shrink-0 rounded-lg px-2 py-3 font-medium text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline ${focusRing}`}
            >
              Staff
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
