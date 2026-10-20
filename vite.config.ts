import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "./build/sites-vite-plugin";
import { localApiPlugin } from "./build/local-api-vite-plugin";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "EMBEDDING_PROVIDER",
    "EMBEDDING_BASE_URL",
    "EMBEDDING_API_KEY",
    "EMBEDDING_MODEL",
    "EMBEDDING_DIMENSIONS",
    "LLM_PROVIDER",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL"
  ]) {
    if (env[name]) process.env[name] = env[name];
  }
  return {
    plugins: [react(), sites(), localApiPlugin()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    // Collect maintained tests only; ignored archives may contain historical .test files.
    test: {
      include: ["src/**/*.test.{ts,tsx,js,mjs}", "api/**/*.test.{ts,tsx,js,mjs}", "scripts/**/*.test.{ts,tsx,js,mjs}", "tests/**/*.test.{ts,tsx,js,mjs}", "build/**/*.test.{ts,tsx,js,mjs}"]
    },
    server: {
      port: 5173
    }
  };
});
