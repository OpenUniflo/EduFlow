import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

if (!existsSync("dist")) throw new Error("dist is missing; run pnpm build first");
const secret = process.env.SUPABASE_SECRET_KEY;
const violations = filesUnder("dist").filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes("SUPABASE_SECRET_KEY") || Boolean(secret && secret.length >= 12 && source.includes(secret));
});
if (violations.length) throw new Error(`Client secret boundary failed in ${violations.join(", ")}`);
console.log("Client secret boundary: passed");
