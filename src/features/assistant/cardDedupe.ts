import { parseAssistantCardRef, type AssistantCardRef } from "./assistantCards";

type TimelineCardPart = { type?: string; output?: unknown };
type TimelineMessage = { id: string; parts?: readonly TimelineCardPart[] };

type KnowledgeCard = Extract<AssistantCardRef, { cardType: "knowledge" }>;
type PracticeCard = Extract<AssistantCardRef, { cardType: "practice" }>;

export type CardCompletionLookup = {
  isMicroCompleted(pathId: string): boolean;
  /** The completed Micro path behind a Knowledge card, or null when absent. */
  knowledgePathId(card: KnowledgeCard): string | null;
  isKnowledgeLearned(nodeId: string): boolean;
  isPracticeCompleted(card: PracticeCard): boolean;
};

function cardFromPart(part: TimelineCardPart): AssistantCardRef | null {
  if (part.type !== "tool-displayCard") return null;
  const output = part.output && typeof part.output === "object" ? part.output as { card?: unknown } : null;
  return parseAssistantCardRef(output?.card);
}

/**
 * A completed result is identified by its object, not by the message that
 * carried it. Micro and Knowledge cards share the Micro path identity, so the
 * same finished point cannot appear twice even when the model changes the card
 * type between the recommendation and the completion reply.
 */
export function completedCardIdentity(card: AssistantCardRef, lookup: CardCompletionLookup): string | null {
  switch (card.cardType) {
    case "micro":
      return lookup.isMicroCompleted(card.pathId) ? `micro:${card.pathId}` : null;
    case "knowledge": {
      // A completed Micro path is the strongest identity; the plain learned
      // node identity is only for a Knowledge card without a Micro path.
      const pathId = lookup.knowledgePathId(card);
      if (pathId) return `micro:${pathId}`;
      return lookup.isKnowledgeLearned(card.nodeId) ? `knowledge:${card.nodeId}` : null;
    }
    case "practice":
      return lookup.isPracticeCompleted(card) ? `practice:${card.courseId}:${card.assignmentId}` : null;
    case "evaluation":
      // Different Attempts are different results. Only the exact same Attempt
      // may collapse to its first card; historical cards without an Attempt
      // identity are left untouched.
      return card.attemptId ? `evaluation:${card.courseId}:${card.assignmentId}:${card.attemptId}` : null;
    default:
      return null;
  }
}

/**
 * Return the display-part keys that must be hidden because the same completed
 * object was already shown earlier in the conversation. Iteration is oldest to
 * newest, so the card the learner originally saw keeps its position.
 */
export function collectSkippedCompletedCards(messages: readonly TimelineMessage[], lookup: CardCompletionLookup): Set<string> {
  const seen = new Set<string>();
  const skipped = new Set<string>();
  for (const message of messages) {
    const parts = message.parts ?? [];
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const card = cardFromPart(parts[partIndex]);
      if (!card) continue;
      const identity = completedCardIdentity(card, lookup);
      if (!identity) continue;
      const key = `${message.id}:${partIndex}`;
      if (seen.has(identity)) skipped.add(key);
      else seen.add(identity);
    }
  }
  return skipped;
}
