import { defineConfig } from "vitest/config";

// Default to the node environment (pure logic + Firebase emulator suites).
// UI test files opt into jsdom with a `// @vitest-environment jsdom` header.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
