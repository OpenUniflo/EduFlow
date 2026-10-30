import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**"]
  },
  {
    files: ["{src,api,scripts,tests}/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }
    },
    rules: {
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-constant-condition": ["error", { checkLoops: false }]
    }
  },
  {
    // Feature code (tests included) receives preview data only through src/app.
    files: ["src/features/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/demo", "@/demo/*", "**/demo", "**/demo/**", "src/demo", "src/demo/*"],
          message: "Feature/shared code must receive Feature Preview sources through src/app injection, not import src/demo."
        }]
      }]
    }
  }
);
