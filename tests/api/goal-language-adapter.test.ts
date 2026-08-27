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

  it("keeps refinement separate from the authoritative original outcome", async () => {
    const generateJson = vi.fn().mockResolvedValue({ value: { status: "ready", intentSummary: "Build an image classifier through projects", candidateKnowledgeIds: ["image-model"] }, metadata: {} });
    const query: any = { select: () => query, eq: () => query, limit: async () => ({ data: [{ id: "image-model", title: "Image Classification", description: "Train image classifiers", tags: [] }], error: null }) };
    await resolveGoalLanguage({ from: vi.fn(() => query) } as any, { goalText: "Train an image model", previousGoalText: "Train an image model", refinement: "Less theory, more practice" }, { generateJson } as any);
    const request = generateJson.mock.calls[0][0];
    expect(JSON.parse(request.user)).toMatchObject({ goalText: "Train an image model", previousGoalText: "Train an image model", refinement: "Less theory, more practice" });
    expect(request.system).toContain("previousGoalText is the authoritative learning outcome");
    expect(request.system).toContain("must not introduce a different subject");
  });
});
