"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavActive } from "@/lib/nav";

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-900/80 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 sm:px-6"
      >
        <Link
          href="/"
          aria-label="Mondial home"
          className="mr-4 flex items-center gap-2 py-3"
        >
          {/* Bronze cup mark on the brand green square — a metallic vertical
              gradient (light rim → deep bronze base) so it reads as a trophy. */}
          <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
            <defs>
              <linearGradient id="navCupSquare" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1eb155" />
                <stop offset="1" stopColor="#14803d" />
              </linearGradient>
              <linearGradient id="navCupMetal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f2c98a" />
                <stop offset="0.5" stopColor="#c47d35" />
                <stop offset="1" stopColor="#8a531f" />
              </linearGradient>
            </defs>
            <rect width="24" height="24" rx="5.5" fill="url(#navCupSquare)" />
            <path
              transform="translate(1.44 1.44) scale(0.88)"
              fill="url(#navCupMetal)"
              d="M19 5h-2V3H7v2H5C3.9 5 3 5.9 3 7v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 16.9V19H7v2h10v-2h-4v-2.1a5.01 5.01 0 0 0 3.61-3.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"
            />
          </svg>
          <span className="font-display text-lg font-extrabold tracking-tight">
            Mondial<span className="text-accent-gold">26</span>
          </span>
        </Link>
        <div className="hidden items-center gap-1 overflow-x-auto scroll-slim md:flex">
          {NAV_ITEMS.map((link) => {
            const active = isNavActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-ink-700 text-white"
                    : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
