import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pitch / brand palette
        pitch: {
          50: "#eafff2",
          500: "#16a34a",
          700: "#15803d",
          900: "#052e16",
        },
        ink: {
          900: "#0a0e14",
          800: "#11151d",
          700: "#1a2030",
          600: "#262d40",
          500: "#3a4255",
          // secondary text — raised to clear WCAG AA (4.5:1) on ink-900/ink-800
          400: "#8b93a6",
          // one intermediate step for tertiary numerals/labels
          300: "#aab1c2",
          // near-white body/emphasis text — keeps the whole text ramp in one
          // named scale (200/100/50 mirror the former slate-300/200/100 hexes).
          200: "#cbd5e1",
          100: "#e2e8f0",
          50: "#f1f5f9",
        },
        accent: {
          // Trophy bronze — warmer and more "World Cup metal" than the generic
          // lemon-gold #fbbf24, still legible on ink-900. Marks model output.
          gold: "#d68f2e",
          ember: "#f97316",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
