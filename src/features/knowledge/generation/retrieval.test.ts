import { describe, expect, it } from "vitest";
import type { SourceLocation } from "@/features/material/parsing/types";
import type { EmbeddingService, KnowledgeCandidate } from "./types";
import {
  cosineSimilarity, knowledgeCandidateEmbeddingText, retrieveRelationCandidatePairs,
  retrieveSemanticDuplicatePairs, RunLocalEmbeddingCache, unorderedCandidatePairId
} from "./retrieval";

const source = (rawBlockId: string, section = "s"): SourceLocation => ({
  sourceMaterialId: "m", sourceType: "pdf", rawBlockId, ordinal: 1, sectionPath: [section], page: 1
});
const candidate = (id: string, sourceRef = source(id)): KnowledgeCandidate => ({
  id, canonicalTitle: id, description: `${id} description`, type: "conceptual", aliases: [], masteryCriteria: [`master ${id}`], sourceRefs: [sourceRef]
});

class TextVectors implements EmbeddingService {
  calls: string[] = [];
  constructor(private readonly vectors: Record<string, number[]>) {}
  async embed(text: string) {
    this.calls.push(text);
    const title = text.split(/\s/)[0];
    return this.vectors[title] ?? [0, 0, 1];
  }
}

describe("ingestion-local embedding retrieval", () => {
  it("computes cosine strictly and caches identical text within a run", async () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow(/equal dimensions/);
    const service = new TextVectors({ A: [1, 0] });
    const cache = new RunLocalEmbeddingCache(service);
    await Promise.all([cache.embed(" A "), cache.embed("A"), cache.embed("A")]);
    expect(service.calls).toHaveLength(1);
    expect(cache.requestCount).toBe(1);
  });

  it("builds candidate text from domain fields without identity metadata", () => {
    const text = knowledgeCandidateEmbeddingText({ ...candidate("secret-id"), canonicalTitle: "Tool Calling", aliases: ["Function Calling"], description: "A stable description", masteryCriteria: ["Explain the capability"] });
    expect(text).toContain("Tool Calling");
    expect(text).toContain("Function Calling");
    expect(text).not.toContain("secret-id");
  });

  it("retrieves embedding-near duplicate pairs but excludes distant pairs", async () => {
    const candidates = [candidate("A"), candidate("B"), candidate("C")];
    const pairs = await retrieveSemanticDuplicatePairs(candidates, new RunLocalEmbeddingCache(new TextVectors({ A: [1, 0, 0], B: [0.99, 0.1, 0], C: [0, 0, 1] })));
    expect(pairs.map((pair) => pair.id)).toEqual([unorderedCandidatePairId("A", "B")]);
  });

  it("unions symmetric top-K pairs with shared-provenance pairs, without self-pairs", async () => {
    const candidates = [candidate("A", source("one", "shared")), candidate("B", source("two", "other")), candidate("C", source("three", "shared")), candidate("D", source("four", "last"))];
    const pairs = await retrieveRelationCandidatePairs(candidates, new RunLocalEmbeddingCache(new TextVectors({ A: [1, 0, 0, 0], B: [0.9, 0.1, 0, 0], C: [0, 1, 0, 0], D: [0, 0, 1, 0] })));
    expect(new Set(pairs.map((pair) => pair.id)).size).toBe(pairs.length);
    expect(pairs.every((pair) => pair.leftCandidateId !== pair.rightCandidateId)).toBe(true);
    expect(pairs.find((pair) => pair.id === unorderedCandidatePairId("A", "C"))?.signals).toContain("shared-provenance");
    expect(pairs).toHaveLength(6);
  });
});
