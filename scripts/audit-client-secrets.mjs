import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

if (!existsSync("dist")) throw new Error("dist is missing; run pnpm build first");
const secretNames = [
  "SUPABASE_SECRET_KEY",
  "EMBEDDING_API_KEY",
  "VITE_EMBEDDING_API_KEY",
  "LLM_API_KEY",
  "VITE_LLM_API_KEY",
  "OPENAI_API_KEY",
  "VITE_OPENAI_API_KEY"
];
const secretValues = [process.env.SUPABASE_SECRET_KEY, process.env.EMBEDDING_API_KEY, process.env.LLM_API_KEY, process.env.OPENAI_API_KEY]
  .filter((value) => value && value.length >= 12);
const violations = filesUnder("dist").filter((file) => {
  const source = readFileSync(file, "utf8");
  return secretNames.some((name) => source.includes(name)) || secretValues.some((secret) => source.includes(secret));
});
violations.push(...filesUnder("src").filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes("EMBEDDING_API_KEY") || source.includes("LLM_API_KEY") || source.includes("OPENAI_API_KEY");
}));
if (violations.length) throw new Error(`Client secret boundary failed in ${violations.join(", ")}`);
console.log("Client secret boundary: passed");
