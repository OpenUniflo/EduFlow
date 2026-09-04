import { describe, expect, it, vi } from "vitest";
import type { StructuredGenerationClient, StructuredGenerationResult } from "../../src/features/knowledge/generation/types";
import { resolveGoalLanguage } from "./goalLanguageAdapter";

const catalog = [
  { id: "CNN", title: "Convolutional Neural Network", description: "A network for local feature learning.", tags: ["vision"] },
  { id: "SPLIT", title: "Train/Validation/Test Split", description: "Separates training, tuning, and evaluation data.", tags: ["evaluation"] }
];

function client() {
  return { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: catalog, error: null }) }) }) }) } as never;
}

function result(value: unknown): StructuredGenerationResult {
  return { value, metadata: { stage: "goal-resolution", provider: "test", model: "test", promptVersion: "test", schemaVersion: "1", requestId: "test", generatedAt: "2026-08-27T00:00:00Z" } };
}

describe("Goal language adapter", () => {
  it("uses one strict generation and validates real catalog identities", async () => {
    const generateJson = vi.fn().mockResolvedValue(result({
      status: "ready", intentSummary: "Train an image classifier", primaryOutcome: "Train an image classifier", refinementIntent: "preserve_outcome", practiceEmphasis: true,
      candidateKnowledgeIds: ["CNN"], targetReasons: [{ knowledgeId: "CNN", reason: "Direct model capability" }]
    }));
    const resolved = await resolveGoalLanguage(client(), { goalText: "Train a model that distinguishes two kinds of images" }, { generateJson } as StructuredGenerationClient);
    expect(resolved).toMatchObject({ status: "ready", candidateKnowledgeIds: ["CNN"] });
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson.mock.calls[0][0].promptVersion).toBe("goal-resolution-v4");
  });

  it("keeps a clear Goal with no catalog coverage separate from clarification", async () => {
    const generateJson = vi.fn().mockResolvedValue(result({ status: "no_match", intentSummary: "Build quantum hardware", primaryOutcome: "Build a quantum processor", practiceEmphasis: true, reason: "No visible learning content directly supports this outcome" }));
    await expect(resolveGoalLanguage(client(), { goalText: "Build a quantum processor" }, { generateJson } as StructuredGenerationClient)).resolves.toMatchObject({ status: "no_match", primaryOutcome: "Build a quantum processor" });
  });

  it("rejects invalid structured output instead of converting it to clarification", async () => {
    const generateJson = vi.fn().mockResolvedValue(result({ status: "ready", candidateKnowledgeIds: ["CNN"] }));
    await expect(resolveGoalLanguage(client(), { goalText: "Train an image classifier" }, { generateJson } as StructuredGenerationClient)).rejects.toThrow();
  });
});
