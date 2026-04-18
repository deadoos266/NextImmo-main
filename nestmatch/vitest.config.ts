import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
    },
    include: ["lib/**/*.test.ts", "lib/**/__tests__/*.test.ts"],
  },
})
