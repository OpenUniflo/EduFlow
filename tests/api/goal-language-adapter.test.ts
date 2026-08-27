import { describe, expect, it, vi } from "vitest";
import { isGoalLanguageProviderUnavailable, parseGoalLanguageResolution, resolveGoalLanguage } from "../../api/_lib/goalLanguageAdapter";

const ready = (id: string, refinementIntent: "preserve_outcome" | "change_outcome" = "preserve_outcome") => ({
  status: "ready" as const, intentSummary: "Build the requested outcome", primaryOutcome: "Complete the requested outcome", refinementIntent,
  candidateKnowledgeIds: [id], targetReasons: [{ knowledgeId: id, reason: "Directly delivers the outcome" }]
});

function knowledgeClient(rows: Array<Record<string, unknown>>) {
  const query: any = { select: () => query, eq: () => query, limit: async () => ({ data: rows, error: null }) };
  return { from: vi.fn(() => query) } as any;
}

describe("Goal Planner language adapter", () => {
  it("recognizes transient provider failures without treating validation errors as outages", () => {
    expect(isGoalLanguageProviderUnavailable(new Error("LLM provider network error"))).toBe(true);
    expect(isGoalLanguageProviderUnavailable(new Error("Invalid target contract"))).toBe(false);
  });

  it("accepts only the bounded structured resolution contract", () => {
    expect(parseGoalLanguageResolution(ready("knowledge-rag"))).toMatchObject({ status: "ready", candidateKnowledgeIds: ["knowledge-rag"] });
    expect(() => parseGoalLanguageResolution({ ...ready("knowledge-rag"), candidateKnowledgeIds: [], targetReasons: [] })).toThrow();
    expect(() => parseGoalLanguageResolution({ status: "magic", candidateKnowledgeIds: ["invented"] })).toThrow();
  });

  it("supplies only visible active identities and requires an independent semantic check", async () => {
    const generateJson = vi.fn().mockResolvedValueOnce({ value: ready("knowledge-rag"), metadata: {} }).mockResolvedValueOnce({ value: { coherent: true, directlySupportingKnowledgeIds: ["knowledge-rag"] }, metadata: {} });
    const result = await resolveGoalLanguage(knowledgeClient([{ id: "knowledge-rag", title: "Retrieval", description: "Ground answers in sources", tags: ["documents"] }]), { goalText: "Answer from my files" }, { generateJson } as any);
    expect(result).toMatchObject({ status: "ready", candidateKnowledgeIds: ["knowledge-rag"] });
    const prompt = JSON.parse(generateJson.mock.calls[0][0].user);
    expect(prompt.visibleKnowledgeCatalog).toEqual([{ id: "knowledge-rag", title: "Retrieval", description: "Ground answers in sources", tags: ["documents"] }]);
    expect(prompt.goalTextRole).toBe("initial_goal");
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it("marks a follow-up as an answer to the latest clarification and audits it with the conversation", async () => {
    const generateJson = vi.fn().mockResolvedValueOnce({ value: ready("image-model"), metadata: {} }).mockResolvedValueOnce({ value: { coherent: true, directlySupportingKnowledgeIds: ["image-model"] }, metadata: {} });
    const conversationContext = [
      { role: "user", content: "我会一点 Python，想训练一个 AI 模型。" },
      { role: "assistant", content: "你最想先做出什么具体结果？" }
    ];
    await resolveGoalLanguage(knowledgeClient([{ id: "image-model", title: "图像分类", description: "训练图片分类模型", tags: [] }]), { goalText: "先做一个能识别猫和狗的小东西。", conversationContext }, { generateJson } as any);
    expect(JSON.parse(generateJson.mock.calls[0][0].user)).toMatchObject({ goalTextRole: "answer_to_latest_clarification", conversationContext });
    expect(JSON.parse(generateJson.mock.calls[1][0].user)).toMatchObject({ conversationContext });
  });

  it("independently rejects a packaging-only clarification and resolves real target identities", async () => {
    const clarify = { status: "clarify", intentSummary: "Train an image classifier", clarificationQuestion: "你要网页还是命令行工具？" };
    const generateJson = vi.fn()
      .mockResolvedValueOnce({ value: clarify, metadata: {} })
      .mockResolvedValueOnce({ value: ready("image-model"), metadata: {} })
      .mockResolvedValueOnce({ value: { coherent: true, directlySupportingKnowledgeIds: ["image-model"] }, metadata: {} });
    const conversationContext = [{ role: "user", content: "我想训练模型" }, { role: "assistant", content: "具体做什么？" }];
    const result = await resolveGoalLanguage(knowledgeClient([{ id: "image-model", title: "Image Classification", description: "Train an image classifier", tags: [] }]), { goalText: "识别猫狗的小项目", conversationContext }, { generateJson } as any);
    expect(result).toMatchObject({ status: "ready", candidateKnowledgeIds: ["image-model"] });
    expect(generateJson.mock.calls[1][0]).toMatchObject({ promptVersion: "goal-clarification-audit-v1" });
    expect(generateJson).toHaveBeenCalledTimes(3);
  });

  it("rejects real but semantically inconsistent targets", async () => {
    const generateJson = vi.fn().mockResolvedValueOnce({ value: ready("language-model"), metadata: {} }).mockResolvedValueOnce({ value: { coherent: false, directlySupportingKnowledgeIds: [], clarificationQuestion: "你想先完成哪一种图片识别成果？" }, metadata: {} });
    const result = await resolveGoalLanguage(knowledgeClient([{ id: "language-model", title: "Language Model", description: "Text", tags: [] }]), { goalText: "做图片识别" }, { generateJson } as any);
    expect(result).toMatchObject({ status: "clarify", clarificationQuestion: "你想先完成哪一种图片识别成果？" });
  });

  it("normalizes an over-selected proposal to its coherent direct target subset", async () => {
    const proposed = {
      ...ready("image-model"),
      candidateKnowledgeIds: ["image-model", "optimization"],
      targetReasons: [
        { knowledgeId: "image-model", reason: "The requested artifact" },
        { knowledgeId: "optimization", reason: "A useful training mechanism" }
      ]
    };
    const generateJson = vi.fn()
      .mockResolvedValueOnce({ value: proposed, metadata: {} })
      .mockResolvedValueOnce({ value: { coherent: true, directlySupportingKnowledgeIds: ["image-model"] }, metadata: {} });
    const result = await resolveGoalLanguage(knowledgeClient([
      { id: "image-model", title: "Image Classification", description: "Train an image classifier", tags: [] },
      { id: "optimization", title: "Optimization", description: "Tune model parameters", tags: [] }
    ]), { goalText: "训练一个猫狗分类模型" }, { generateJson } as any);
    expect(result).toMatchObject({ status: "ready", candidateKnowledgeIds: ["image-model"], targetReasons: [{ knowledgeId: "image-model" }] });
  });

  it("deterministically preserves prior targets for preference-only refinement", async () => {
    const generateJson = vi.fn().mockResolvedValue({ value: ready("agent"), metadata: {} });
    const result = await resolveGoalLanguage(knowledgeClient([{ id: "image-model", title: "Image", description: "Image", tags: [] }, { id: "agent", title: "Agent", description: "Agent", tags: [] }]), { goalText: "Train an image model", previousGoalText: "Train an image model", previousKnowledgeIds: ["image-model"], refinement: "Less theory, more practice" }, { generateJson } as any);
    expect(result).toMatchObject({ status: "ready", candidateKnowledgeIds: ["image-model"], refinementIntent: "preserve_outcome" });
    expect(generateJson).toHaveBeenCalledTimes(1);
  });

  it("keeps refinement outcome-stable even when the model proposes drift", async () => {
    const generateJson = vi.fn().mockResolvedValue({ value: ready("agent", "change_outcome"), metadata: {} });
    const result = await resolveGoalLanguage(knowledgeClient([{ id: "image-model", title: "Image", description: "Image", tags: [] }, { id: "agent", title: "Agent", description: "Agent", tags: [] }]), { goalText: "Train an image model", previousGoalText: "Train an image model", previousKnowledgeIds: ["image-model"], refinement: "More practical" }, { generateJson } as any);
    expect(result).toMatchObject({ status: "ready", candidateKnowledgeIds: ["image-model"], refinementIntent: "preserve_outcome" });
  });
});
