import { createEmbeddingService } from "../api/_lib/embedding.js";
import { readEmbeddingEnvironment } from "../api/_lib/env.js";

const environment = readEmbeddingEnvironment();
const embedding = await createEmbeddingService(environment).embed("Tool Calling");

if (embedding.length === 0) throw new Error("Embedding smoke test returned an empty vector");
if (embedding.length !== environment.embeddingDimensions) {
  throw new Error(`Embedding smoke test expected ${environment.embeddingDimensions} dimensions, received ${embedding.length}`);
}
if (!embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
  throw new Error("Embedding smoke test returned a non-finite value");
}

console.log("Embedding verification passed");
console.log(`provider: ${environment.embeddingProvider}`);
console.log(`model: ${environment.embeddingModel}`);
console.log(`configured dimensions: ${environment.embeddingDimensions}`);
console.log(`actual dimensions: ${embedding.length}`);
console.log("vector valid: yes");
