import { assignmentProjectionForNode, type CourseDetailFacet, type SelectedAnchor } from "@/features/course/courseSelection";
import type { CourseGraphData, CourseRuntimeData } from "@/features/course/runtime/courseRuntime";

type CourseContextBase = {
  key: string;
  courseId: string;
  courseTitle: string;
  label: string;
};

export type CourseDesignAssistantContext = CourseContextBase & (
  | { kind:"course"; chapterCount:number; knowledgeCount:number; assignmentCount:number }
  | { kind:"chapter"; chapterId:string; knowledgeCount:number; assignmentCount:number; materialCoverageCount:number; stageOutcome?:string }
  | { kind:"knowledge"; nodeId:string; chapterTitle:string; predecessors:string[]; successors:string[]; relatedMaterials:Array<{id:string;title:string}>; relatedAssignments:string[]; materialCoverageCount:number }
  | { kind:"assignment"; assignmentId:string; coveredKnowledge:string[]; dependencies:string[]; inheritedOutputs:string[]; acceptanceCriteria:string[]; experienceType:string }
);

export type CourseDesignAssistantAction = { id:string; label:string };
export type CourseDesignAssistantResponse = { message:string; fallback?:boolean };

export interface CourseDesignAssistantProvider {
  getActions(context: CourseDesignAssistantContext): CourseDesignAssistantAction[];
  resolveAction(context: CourseDesignAssistantContext, actionId:string): CourseDesignAssistantResponse;
  resolveText(context: CourseDesignAssistantContext, input:string): CourseDesignAssistantResponse;
}

export function buildCourseDesignAssistantContext(
  runtime: CourseRuntimeData,
  graphData: CourseGraphData,
  selectedAnchor: SelectedAnchor | null,
  detailFacet: CourseDetailFacet,
  activeAssignmentId: string | null
): CourseDesignAssistantContext {
  const base = { courseId:runtime.course.id, courseTitle:runtime.course.title };
  if (!selectedAnchor) return {
    ...base,
    kind:"course",
    key:`course:${runtime.course.id}`,
    label:runtime.course.title,
    chapterCount:graphData.chapters.length,
    knowledgeCount:graphData.knowledgeNodes.length,
    assignmentCount:runtime.assignments.length
  };
  if (selectedAnchor.kind === "chapter") {
    const chapter = graphData.chapters.find((item) => item.id === selectedAnchor.id);
    const nodes = graphData.knowledgeNodes.filter((item) => item.chapterId === selectedAnchor.id);
    if (!chapter) return buildCourseDesignAssistantContext(runtime, graphData, null, detailFacet, activeAssignmentId);
    return {
      ...base,
      kind:"chapter",
      key:`chapter:${chapter.id}`,
      label:chapter.title,
      chapterId:chapter.id,
      knowledgeCount:nodes.length,
      assignmentCount:chapter.assignmentSummary.assignmentCount,
      materialCoverageCount:nodes.reduce((sum, node) => sum + node.materialContexts.reduce((count, context) => count + context.segmentIds.length, 0), 0),
      stageOutcome:chapter.outcome
    };
  }
  const node = graphData.knowledgeNodes.find((item) => item.id === selectedAnchor.id);
  if (!node) return buildCourseDesignAssistantContext(runtime, graphData, null, detailFacet, activeAssignmentId);
  if (detailFacet === "assignment") {
    const projection = assignmentProjectionForNode(node, activeAssignmentId);
    if (projection.kind === "detail") {
      const assignment = projection.context.assignment;
      const coveredKnowledge = runtime.assignmentCoverages.filter((coverage) => coverage.assignmentId === assignment.id).flatMap((coverage) => {
        const covered = graphData.knowledgeNodes.find((item) => item.id === coverage.nodeId);
        return covered ? [covered.title] : [];
      });
      const dependencies = runtime.assignmentDependencies.filter((dependency) => dependency.targetAssignmentId === assignment.id).flatMap((dependency) => {
        const source = runtime.assignments.find((item) => item.id === dependency.sourceAssignmentId);
        return source ? [source.title] : [];
      });
      return {
        ...base,
        kind:"assignment",
        key:`assignment:${assignment.id}`,
        label:assignment.title,
        assignmentId:assignment.id,
        coveredKnowledge,
        dependencies,
        inheritedOutputs:assignment.inheritedOutputs ?? [],
        acceptanceCriteria:assignment.acceptanceCriteria,
        experienceType:assignment.experience?.type ?? assignment.mode
      };
    }
  }
  const chapterTitle = graphData.chapters.find((item) => item.id === node.chapterId)?.title ?? node.chapterId;
  const titleForNode = (id:string) => graphData.knowledgeNodes.find((item) => item.id === id)?.title ?? id;
  return {
    ...base,
    kind:"knowledge",
    key:`knowledge:${node.id}`,
    label:node.title,
    nodeId:node.id,
    chapterTitle,
    predecessors:graphData.knowledgeEdges.filter((edge) => edge.target === node.id).map((edge) => titleForNode(edge.source)),
    successors:graphData.knowledgeEdges.filter((edge) => edge.source === node.id).map((edge) => titleForNode(edge.target)),
    relatedMaterials:node.materialContexts.map((context) => ({id:context.materialId,title:context.materialTitle})),
    relatedAssignments:node.assignmentContexts.map((context) => context.assignment.title),
    materialCoverageCount:node.materialContexts.reduce((sum, context) => sum + context.segmentIds.length, 0)
  };
}
