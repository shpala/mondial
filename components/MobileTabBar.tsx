"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavActive } from "@/lib/nav";

/** Fixed bottom tab bar for phones (hidden on md+). Shares NAV_ITEMS with the
 *  desktop SiteNav so the two navs expose the same destinations. */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md">
        {NAV_ITEMS.map((t) => {
          const active = isNavActive(pathname, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
                active ? "text-pitch-50" : "text-ink-400 active:text-ink-100"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {t.icon}
              </span>
              {t.shortLabel}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
