export type MaterialKnowledgeContextState = {
  selectedKnowledgeId: string | null;
  pinnedKnowledgeId: string | null;
};

export type MaterialKnowledgeContextAction =
  | { type: "material-change"; currentPagePrimaryKnowledgeId: string | null }
  | { type: "page-change"; currentPagePrimaryKnowledgeId: string | null }
  | { type: "select"; nodeId: string }
  | { type: "pin" }
  | { type: "unpin"; currentPagePrimaryKnowledgeId: string | null };

export function createMaterialKnowledgeContextState(currentPagePrimaryKnowledgeId: string | null): MaterialKnowledgeContextState {
  return { selectedKnowledgeId: currentPagePrimaryKnowledgeId, pinnedKnowledgeId: null };
}

export function reduceMaterialKnowledgeContextState(state: MaterialKnowledgeContextState, action: MaterialKnowledgeContextAction): MaterialKnowledgeContextState {
  switch (action.type) {
    case "material-change":
      return createMaterialKnowledgeContextState(action.currentPagePrimaryKnowledgeId);
    case "page-change":
      return state.pinnedKnowledgeId ? state : { ...state, selectedKnowledgeId: action.currentPagePrimaryKnowledgeId };
    case "select":
      return { ...state, selectedKnowledgeId: action.nodeId };
    case "pin":
      return state.selectedKnowledgeId ? { ...state, pinnedKnowledgeId: state.selectedKnowledgeId } : state;
    case "unpin":
      return { selectedKnowledgeId: action.currentPagePrimaryKnowledgeId, pinnedKnowledgeId: null };
  }
}

export function resolveEffectiveKnowledgeId(state: MaterialKnowledgeContextState, currentPagePrimaryKnowledgeId: string | null) {
  return state.pinnedKnowledgeId ?? state.selectedKnowledgeId ?? currentPagePrimaryKnowledgeId;
}
