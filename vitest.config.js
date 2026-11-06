import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "*.config.js",
        "*.config.ts",
        "public/js/bundle.js",
        "public/js/bundle.js.map",
      ],
    },
    include: ["tests/**/*.test.js", "tests/**/*.test.ts"],
  },
});
