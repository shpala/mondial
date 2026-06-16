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
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-pitch-500 to-pitch-700 text-lg">
            ⚽
          </span>
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
