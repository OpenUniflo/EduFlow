import { createContext, useContext } from "react";

export type ConversationNextStepCard =
  | { kind: "micro"; pathId: string }
  | { kind: "practice"; assignmentId: string };

export type ConversationCardRegistry = {
  nextStep: ConversationNextStepCard | null;
  register(element: HTMLElement): void;
  unregister(element: HTMLElement): void;
};

/** Lets answer cards report the one next-step card so the Home strip can step aside. */
export const ConversationCardRegistryContext = createContext<ConversationCardRegistry | null>(null);

export function useConversationCardRegistry() {
  return useContext(ConversationCardRegistryContext);
}
