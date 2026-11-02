import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/*.test.ts"],
    testTimeout: process.env.TEST_DATABASE_URL ? 30000 : 5000,
    coverage: {
      provider: "v8",
      include: ["server/domain.ts"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
