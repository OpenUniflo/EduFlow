import tseslint from "typescript-eslint";

export default tseslint.config({
  ignores: ["dist/**"],
  files: ["{src,api,scripts}/**/*.{ts,tsx}"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }
  },
  rules: {
    "no-duplicate-imports": "error",
    "no-unreachable": "error",
    "no-constant-condition": ["error", { checkLoops: false }]
  }
});
