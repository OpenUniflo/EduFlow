import { describe, expect, it, vi } from "vitest";
import type { StructuredGenerationClient, StructuredGenerationResult } from "../../src/features/knowledge/generation/types";
import { resolveGoalLanguage } from "./goalLanguageAdapter";

const catalog = [
  { id: "CNN", title: "Convolutional Neural Network", description: "A network for local feature learning.", tags: ["vision"] },
  { id: "SPLIT", title: "Train/Validation/Test Split", description: "Separates training, tuning, and evaluation data.", tags: ["evaluation"] }
];

function client() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ limit: async () => ({ data: catalog, error: null }) })
      })
    })
  } as never;
}

function result(value: unknown): StructuredGenerationResult {
  return { value, metadata: { stage: "goal-resolution", provider: "test", model: "test", promptVersion: "test", schemaVersion: "1", requestId: "test", generatedAt: "2026-08-27T00:00:00Z" } };
}

describe("Goal language adapter", () => {
  it("independently audits an unsupported proposal and still revalidates real catalog IDs", async () => {
    const generateJson = vi.fn()
      .mockResolvedValueOnce(result({ status: "unsupported", intentSummary: "No matching knowledge", reason: "Unsupported" }))
      .mockResolvedValueOnce(result({
        status: "ready", intentSummary: "Train an image classifier", primaryOutcome: "Train an image classifier", refinementIntent: "preserve_outcome",
        candidateKnowledgeIds: ["CNN", "SPLIT"], targetReasons: [{ knowledgeId: "CNN", reason: "Direct model capability" }, { knowledgeId: "SPLIT", reason: "Directly validates the trained model" }]
      }))
      .mockResolvedValueOnce(result({ coherent: true, directlySupportingKnowledgeIds: ["CNN", "SPLIT"] }));

    const resolved = await resolveGoalLanguage(client(), { goalText: "Train a model that distinguishes two kinds of images" }, { generateJson } as StructuredGenerationClient);

    expect(resolved).toMatchObject({ status: "ready", candidateKnowledgeIds: ["CNN", "SPLIT"] });
    expect(generateJson).toHaveBeenCalledTimes(3);
    expect(generateJson.mock.calls[1][0].promptVersion).toBe("goal-unsupported-audit-v1");
  });

  it("keeps unsupported when an independent catalog-grounded audit agrees", async () => {
    const generateJson = vi.fn()
      .mockResolvedValueOnce(result({ status: "unsupported", intentSummary: "Quantum hardware", reason: "No matching knowledge" }))
      .mockResolvedValueOnce(result({ status: "unsupported", intentSummary: "Quantum hardware", reason: "No matching knowledge" }));

    await expect(resolveGoalLanguage(client(), { goalText: "Build a quantum processor" }, { generateJson } as StructuredGenerationClient)).resolves.toMatchObject({ status: "unsupported" });
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
});
