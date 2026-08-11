import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
