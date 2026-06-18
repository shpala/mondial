/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the Turbopack workspace root to this project — the parent `dev/` folder
  // holds other repos' lockfiles, which Next would otherwise infer the root from.
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io" },
      { protocol: "https", hostname: "flagcdn.com" },
    ],
  },
  // Don't advertise the framework.
  poweredByHeader: false,
  // Baseline security headers for this public, read-only app. (CSP is omitted
  // deliberately — it needs nonces for React 19 / Tailwind inline styles.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
