import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["tests/goldenPath.e2e.test.ts", "tests/rls.test.ts", "tests/load.test.ts", "tests/e2e/**"],
    coverage: { enabled: false },
  },
});
