import Link from "next/link";

export type Crumb = { label: string; href?: string };

/**
 * Lightweight breadcrumb trail for detail pages. Replaces ad-hoc "← back" links
 * (which guessed a destination the user often never came from) with a truthful
 * Home / Section / Page hierarchy. The final crumb is the current page.
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-400">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="hover:text-ink-100 hover:underline"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={last ? "truncate text-ink-200" : undefined}
                  aria-current={last ? "page" : undefined}
                >
                  {c.label}
                </span>
              )}
              {!last && (
                <span aria-hidden className="text-ink-600">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
