import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "happy-dom", // Use happy-dom for DOM APIs (DOMParser, etc.)
		globals: true, // Enable global test functions (describe, it, expect)
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
