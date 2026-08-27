import { describe, expect, it, vi } from "vitest";
import { parseGoalLanguageResolution, resolveGoalLanguage } from "../../api/_lib/goalLanguageAdapter";

describe("Goal Planner language adapter", () => {
  it("accepts only the bounded structured resolution contract", () => {
    expect(parseGoalLanguageResolution({ status: "ready", intentSummary: "Build with private documents", candidateKnowledgeIds: ["knowledge-rag"] })).toMatchObject({ status: "ready", candidateKnowledgeIds: ["knowledge-rag"] });
    expect(() => parseGoalLanguageResolution({ status: "ready", intentSummary: "Invent", candidateKnowledgeIds: [] })).toThrow();
    expect(() => parseGoalLanguageResolution({ status: "magic", candidateKnowledgeIds: ["invented"] })).toThrow();
  });

  it("supplies only server-visible active Knowledge catalog identities to the model", async () => {
    const generateJson = vi.fn().mockResolvedValue({ value: { status: "ready", intentSummary: "Build with private documents", candidateKnowledgeIds: ["knowledge-rag"] }, metadata: {} });
    const query: any = { select: () => query, eq: () => query, limit: async () => ({ data: [{ id: "knowledge-rag", title: "Retrieval", description: "Ground answers in sources", tags: ["documents"] }], error: null }) };
    const client = { from: vi.fn(() => query) } as any;
    const result = await resolveGoalLanguage(client, { goalText: "I want something that answers from my own files" }, { generateJson } as any);
    expect(result).toMatchObject({ status: "ready", candidateKnowledgeIds: ["knowledge-rag"] });
    const prompt = JSON.parse(generateJson.mock.calls[0][0].user);
    expect(prompt.visibleKnowledgeCatalog).toEqual([{ id: "knowledge-rag", title: "Retrieval", description: "Ground answers in sources", tags: ["documents"] }]);
  });
});
