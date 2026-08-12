import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const hosted = !/^https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(url);
if (hosted && process.env.ALLOW_HOSTED_SEED !== "KnowledgeAtlas") throw new Error("Hosted storage seed requires ALLOW_HOSTED_SEED=KnowledgeAtlas");

const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const assets = [
  ["public/materials/agentic-ai/lesson-04.pdf", "shared/agentic-ai/lesson-04.pdf"],
  ["public/materials/python-engineering/lesson-02.pdf", "shared/python-engineering/lesson-02.pdf"],
  ["public/materials/python-engineering/lesson-04.pdf", "shared/python-engineering/lesson-04.pdf"],
  ["public/materials/python-engineering/lesson-07.pdf", "shared/python-engineering/lesson-07.pdf"]
] as const;

for (const [source, path] of assets) {
  const bytes = await readFile(source);
  const { error } = await client.storage.from("course-materials").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Storage seed failed for ${path}: ${error.message}`);
}
console.log(`Seeded ${assets.length} controlled course material objects into ${hosted ? "Hosted KnowledgeAtlas" : "Local Supabase"}.`);
