import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Flat config replacing the removed `next lint`: Next's recommended rules
// (core-web-vitals) + TypeScript, shipped as native flat-config arrays.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
      // One-off prediction-model exploration scripts (the algorithm bakeoff —
      // docs/algo-bakeoff.md). Kept for reproducibility but not production code,
      // so they are not held to the app's lint bar. The shipped logic lives in
      // lib/backtest/wcflatten.ts (linted) and is covered by tests.
      "scripts/explore/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
