import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

// The frame of every screen (docs/design.md §11.1): a small header, the page in a phone-wide column, the Staff
// link in the footer only.

export const metadata: Metadata = {
  title: "Goldhahn: order ahead",
  description: "Order halal chicken ahead and pick it up at your time slot.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ea580c" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-stone-50 text-stone-900 antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-md items-center px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-orange-600">
              Goldhahn
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">{children}</main>
        <footer className="mx-auto w-full max-w-md px-4 pt-4 pb-28 text-xs text-stone-400">
          <span>Goldhahn is a made-up restaurant; payments run in Stripe test mode.</span>{" "}
          <Link href="/staff" className="underline">
            Staff
          </Link>
        </footer>
      </body>
    </html>
  );
}
