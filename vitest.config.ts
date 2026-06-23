import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` throws if imported outside RSC; stub it so the data layer
      // is unit-testable under Node.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Informational only — `npm run test:coverage`. No thresholds, so it never
    // fails the build; `npm test` (and CI) stay coverage-free and fast.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      include: ["lib/**", "components/**", "store/**"],
      exclude: ["**/*.d.ts"],
    },
  },
});
