import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { MobileTabBar } from "@/components/MobileTabBar";

// Distinctive display face for headings, scores and stats (body stays system sans).
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mondial — 2026 World Cup",
  description:
    "Current 2026 FIFA World Cup squads, starting lineups, and an interactive prediction bracket.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-screen">
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-24 sm:px-6 md:pb-20">
          {children}
        </main>
        <footer className="border-t border-ink-700 py-6 pb-24 text-center text-xs text-ink-400 md:pb-6">
          Mondial · unofficial 2026 World Cup companion · data via openfootball
          &amp; TheSportsDB
        </footer>
        <MobileTabBar />
      </body>
    </html>
  );
}
