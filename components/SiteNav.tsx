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
          {/* The same ball used as the favicon / link-preview icon, so the tab,
              header and WhatsApp preview all carry one identical mark. */}
          <svg viewBox="0 0 180 180" className="h-8 w-8" aria-hidden>
            <defs>
              <linearGradient id="navBallSquare" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1eb155" />
                <stop offset="1" stopColor="#14803d" />
              </linearGradient>
              <radialGradient id="navBallSheen" cx="0.38" cy="0.30" r="0.9">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="#dfe6ee" />
              </radialGradient>
              <clipPath id="navBallClip">
                <circle cx="90" cy="90" r="58" />
              </clipPath>
            </defs>
            <rect width="180" height="180" rx="40" fill="url(#navBallSquare)" />
            <circle cx="90" cy="90" r="58" fill="url(#navBallSheen)" />
            <g clipPath="url(#navBallClip)" stroke="#0b1220">
              <line x1="90" y1="70" x2="90" y2="32" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="109.02" y1="83.82" x2="145.16" y2="72.08" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="101.76" y1="106.18" x2="124.09" y2="136.92" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="78.24" y1="106.18" x2="55.91" y2="136.92" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="70.98" y1="83.82" x2="34.84" y2="72.08" strokeWidth="2.4" strokeLinecap="round" />
              <polygon points="108.22,64.92 102.41,47.03 117.63,35.98 132.84,47.03 127.03,64.92" fill="#0b1220" stroke="none" />
              <polygon points="119.48,99.58 134.70,88.52 149.92,99.58 144.10,117.47 125.30,117.47" fill="#0b1220" stroke="none" />
              <polygon points="90.00,121.00 105.22,132.06 99.40,149.94 80.60,149.94 74.78,132.06" fill="#0b1220" stroke="none" />
              <polygon points="60.52,99.58 54.70,117.47 35.90,117.47 30.08,99.58 45.30,88.52" fill="#0b1220" stroke="none" />
              <polygon points="71.78,64.92 52.97,64.92 47.16,47.03 62.37,35.98 77.59,47.03" fill="#0b1220" stroke="none" />
              <polygon points="90.00,70.00 109.02,83.82 101.76,106.18 78.24,106.18 70.98,83.82" fill="#0b1220" stroke="none" />
            </g>
            <circle cx="90" cy="90" r="58" fill="none" stroke="#0b1220" strokeWidth="1.5" strokeOpacity="0.22" />
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
