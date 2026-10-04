import type { AssistantContextSnapshot } from './assistantContract';

type Selection = Pick<AssistantContextSnapshot, 'knowledgeId' | 'chapterId' | 'assignmentId' | 'edgeId' | 'actionId' | 'actionRunId' | 'selectedObject'>;

/** Replace presentation identity in full; never merge a previous view's selection. */
export function coursePresentationContext(input: {
  courseId: string;
  presentation: 'graph' | 'path' | 'capability';
  design: boolean;
  routeVersionId?: string;
  graph: Selection;
  path: Selection;
  capability: Selection;
}): AssistantContextSnapshot {
  const selection = input.presentation === 'graph' ? input.graph : input.presentation === 'path' ? input.path : input.capability;
  return {
    workspace: 'courses', experienceMode: input.presentation === 'graph' && input.design ? 'design' : 'learn',
    courseId: input.courseId, presentation: input.presentation === 'graph' ? 'skill-tree' : input.presentation === 'path' ? 'personal-route' : 'project-capability',
    ...(input.presentation !== 'graph' && input.routeVersionId ? { routeVersionId: input.routeVersionId } : {}), ...selection,
  };
}

export function learningPresentationContext(view: 'today' | 'knowledge' | 'history' | 'evidence', today: { courseId?: string; knowledgeId?: string }, evidence?: {sourceId?:string;runId?:string}): AssistantContextSnapshot {
  return { workspace: 'learning', experienceMode: 'learn', presentation: view, ...(view === 'today' ? today : view === 'evidence' ? {evidenceSourceId:evidence?.sourceId,diagnosisRunId:evidence?.runId} : {}) };
}

export function fallbackAssistantContext(pathname: string): AssistantContextSnapshot {
  const matched = /^\/courses\/([^/]+)/.exec(pathname)?.[1];
  const courseId = matched && matched !== 'create' ? decodeURIComponent(matched) : undefined;
  const workspace = pathname.startsWith('/explore') ? 'explore' : pathname.startsWith('/courses') ? 'courses' : pathname.startsWith('/teaching') ? 'teaching' : pathname.startsWith('/workflows') ? 'canvas' : pathname.startsWith('/messages') ? 'messages' : 'learning';
  return { workspace, experienceMode: 'learn', ...(courseId ? { courseId } : {}) };
}
