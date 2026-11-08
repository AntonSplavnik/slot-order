import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { focusRing } from "@/components/ui";
import "./globals.css";

// The frame of every screen (docs/design.md §11.1, §11.6): the page in a phone-wide column (each page brings its
// own compact header), the made-up restaurant note and the Staff link in the footer.

export const metadata: Metadata = {
  title: "Goldhahn: order ahead",
  description: "Order halal chicken ahead and pick it up at your time slot.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-white text-base text-neutral-900 antialiased">
        <main className="mx-auto w-full max-w-md flex-1 px-4">{children}</main>
        <footer className="mx-auto w-full max-w-md px-4">
          <div className="flex items-center justify-between gap-4 border-t border-neutral-200 pt-4 pb-40 text-xs text-neutral-500">
            <span>Goldhahn is a made-up restaurant; payments run in Stripe test mode.</span>
            <Link
              href="/staff"
              className={`shrink-0 rounded-lg px-2 py-3 font-semibold text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline ${focusRing}`}
            >
              Staff
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
