import { isUrl } from "@/lib/format";

export function TeamFlag({
  flag,
  alt,
  size = 22,
  decorative = false,
}: {
  flag: string;
  alt: string;
  size?: number;
  /** When an adjacent visible label already names the team, hide the flag from
   *  assistive tech to avoid double announcements. */
  decorative?: boolean;
}) {
  if (isUrl(flag)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={flag}
        alt={decorative ? "" : alt}
        aria-hidden={decorative || undefined}
        width={size}
        height={size}
        className="inline-block rounded-sm object-contain align-middle"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      style={{ fontSize: size * 0.9, lineHeight: 1 }}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
    >
      {flag}
    </span>
  );
}
