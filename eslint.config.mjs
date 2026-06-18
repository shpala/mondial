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
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
