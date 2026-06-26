import type { ReactElement } from "react";

/**
 * Shared frame for the per-route Open Graph images: the brand mark beside a
 * green-ruled content column on the dark canvas, matching app/opengraph-image.tsx.
 * Returns the element; the caller wraps it in `new ImageResponse(..., size)`.
 * Satori-safe — every multi-child box sets `display: flex` explicitly.
 */
export function ogCard({
  mark,
  eyebrow,
  children,
}: {
  mark: string;
  eyebrow: string;
  children: ReactElement;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: "72px 84px",
        background: "#0a0e14",
        color: "#f1f5f9",
        fontFamily: "sans-serif",
      }}
    >
      {/* Plain <img> is required inside ImageResponse/Satori — next/image doesn't
          run there. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mark}
        width={232}
        height={232}
        alt=""
        style={{ borderRadius: 48 }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          marginLeft: 56,
          paddingLeft: 40,
          borderLeft: "4px solid #16a34a",
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#8b93a6",
          }}
        >
          {eyebrow}
        </div>
        {children}
      </div>
    </div>
  );
}
