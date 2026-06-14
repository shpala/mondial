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
        },
        accent: {
          gold: "#fbbf24",
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
