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
};

export default nextConfig;
