import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Built bundles and captured upstream HTML are generated inputs, not source formatting targets.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "public/js/**",
    "movember-html.html",
  ],
});
