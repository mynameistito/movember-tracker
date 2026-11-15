import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstack from "ultracite/oxlint/tanstack";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

// This mixed JS/TS project uses JSDoc syntax, including typed @throws tags.
// TSDoc syntax checking conflicts with those JSDoc tags.
const jsPlugins = selectJsPlugins([
  "github",
  "jsdoc-js",
  "sonarjs",
  "react-doctor",
]);

export default defineConfig({
  env: core.env,
  extends: [
    core,
    vitest,
    react,
    tanstack,
    tanstackJsPlugins,
    shadcn,
    antiSlop,
    jsPlugins,
  ],
  ignorePatterns: [...core.ignorePatterns, "public/js/**"],
  jsPlugins: [...jsPlugins.jsPlugins, ...shadcn.jsPlugins],
  options: { typeAware: true },
  overrides: [
    {
      files: ["tests/proxy.test.ts", "tests/regex-patterns.test.js"],
      rules: {
        // These fixtures deliberately exercise insecure URL rejection and legacy parsing.
        "sonarjs/no-clear-text-protocols": "off",
      },
    },
    {
      files: ["src/client/tracking.ts"],
      rules: {
        // Effect service tags and their typed errors share the capability module.
        "eslint/max-classes-per-file": "off",
        // Schema.TaggedError is a class factory, not an Error constructor.
        "unicorn/throw-new-error": "off",
      },
    },
  ],
  settings: jsPluginSettings,
});
