import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Link from "next/link";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { MobileTabBar } from "@/components/MobileTabBar";
import { VerdictBand, VerdictBandSkeleton } from "@/components/VerdictBand";
import { VerdictBandSlot } from "@/components/VerdictBandSlot";

// Distinctive display face for headings, scores and stats (body stays system sans).
// `display: "optional"` (not "swap"): the hero <h1> is the LCP element, and a late
// swap from the system fallback to Space Grotesk reflows that huge heading — a large,
// every-load CLS hit on slower connections. "optional" gives the font a ~100ms window
// (it's preloaded, so most visits still get it with zero shift); anyone slower keeps
// the metric-matched fallback for the page's life, so the heading never moves.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display-face",
  display: "optional",
});

const DESCRIPTION =
  "Live 2026 FIFA World Cup bracket, title odds and a transparent, self-grading prediction model.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cup.shpa.la"),
  title: {
    default: "Mondial — 2026 World Cup",
    template: "%s · Mondial",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "Mondial — 2026 World Cup",
    description: DESCRIPTION,
    siteName: "Mondial26",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mondial — 2026 World Cup",
    description: DESCRIPTION,
  },
};

// viewport-fit=cover lets env(safe-area-inset-*) resolve to non-zero on notched
// iOS — without it the MobileTabBar's bottom inset (and the clearances that
// depend on it) are inert, leaving the fixed tabs inside the home-indicator strip.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <SiteNav />
        <VerdictBandSlot>
          <Suspense fallback={<VerdictBandSkeleton />}>
            <VerdictBand />
          </Suspense>
        </VerdictBandSlot>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-hidden sm:px-6 md:pb-20"
        >
          {children}
        </main>
        <footer className="border-t border-ink-700 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center text-xs text-ink-400 md:pb-6">
          <nav
            aria-label="More"
            className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          >
            <Link
              href="/methodology"
              className="font-medium text-ink-300 transition hover:text-ink-100"
            >
              Methodology
            </Link>
          </nav>
          Mondial · unofficial 2026 World Cup companion · data via openfootball
          &amp; TheSportsDB
        </footer>
        <MobileTabBar />
        {/* Privacy-friendly, cookieless: page-view analytics + real-user Core
            Web Vitals. Only collect on Vercel production deployments. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
