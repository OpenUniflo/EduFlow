import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeRepository } from "@/features/knowledge/repository/InMemoryKnowledgeRepository";
import { globalKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import { routeOnlyKnowledgeGraph, routeOnlyRuntime } from "./courseFoundation.fixture";
import { assignmentProjectionForNode, courseDrawerProjectionKind } from "../courseSelection";
import { buildCourseGraphProjection } from "../graph/courseGraphProjection";
import { auditCourseAssetCoverage, courseAssetCoverageLabel } from "./courseAssetCoverage";
import { buildCourseGraphData, validateCourseIntegrity, validateCourseRuntime } from "./courseRuntime";

const knowledgeRepository = new InMemoryKnowledgeRepository(routeOnlyKnowledgeGraph);

describe("Course foundation contract", () => {
  it("accepts and projects a ready Knowledge route without learning assets", () => {
    expect(validateCourseRuntime(routeOnlyRuntime, knowledgeRepository, globalKnowledgeAccess)).toBe(true);

    const graphData = buildCourseGraphData(routeOnlyRuntime, {
      userId: "learner",
      courseId: routeOnlyRuntime.course.id,
      isActive: false,
      assignmentStates: {},
      materialStates: {},
      updatedAt: "2026-08-25T00:00:00.000Z"
    }, routeOnlyKnowledgeGraph);
    const projection = buildCourseGraphProjection(graphData, "full", null);

    expect(graphData.knowledgeNodes).toHaveLength(1);
    expect(graphData.assignmentSummary.assignmentCount).toBe(0);
    expect(graphData.knowledgeNodes[0]).toMatchObject({ assignmentCount: 0, materialIds: [] });
    expect(projection.nodes.map((node) => node.id)).toEqual(["chapter:route-only-chapter", "knowledge:route-knowledge"]);
    expect(routeOnlyRuntime.course.lifecycle).toBe("published");
    expect(assignmentProjectionForNode(graphData.knowledgeNodes[0], null)).toEqual({ kind: "empty", contexts: [] });
    expect(courseDrawerProjectionKind({ kind: "knowledge", id: "route-knowledge" }, "assignment", graphData.knowledgeNodes[0])).toBe("assignment-empty");
  });

  it("reports optional asset gaps without turning them into structural failures", () => {
    const audit = auditCourseAssetCoverage(routeOnlyRuntime);

    expect(audit).toMatchObject({
      knowledgeCount: 1,
      assignments: { coveredKnowledgeCount: 0, missingKnowledgeCount: 1 },
      materials: { coveredKnowledgeCount: 0, missingKnowledgeCount: 1 },
      micro: { status: "unavailable", coveredKnowledgeCount: null, missingKnowledgeCount: null },
      actionability: { actionableKnowledgeCount: null, noExecutableActivities: false },
      chapterOutcomes: { coveredChapterCount: 0, missingChapterCount: 1 },
      finalProjects: { count: 0, missing: true }
    });
    expect(audit.issues.map((issue) => issue.code)).toEqual([
      "missing-assignment-coverage",
      "missing-material-coverage",
      "micro-coverage-unavailable",
      "missing-chapter-outcome",
      "missing-final-project"
    ]);
    expect(courseAssetCoverageLabel(audit)).toBe("学习资产待补充");
  });

  it("distinguishes a valid route from an executable Course and reports a structured practice gap", () => {
    const audit = auditCourseAssetCoverage(routeOnlyRuntime, { microKnowledgeIds: [], practiceEmphasis: true });
    expect(audit).toMatchObject({
      knowledgeCount: 1,
      micro: { status: "available", coveredKnowledgeCount: 0, missingKnowledgeCount: 1 },
      actionability: { actionableKnowledgeCount: 0, actionableKnowledgeNodeIds: [], noExecutableActivities: true },
      practice: { emphasized: true, assignmentCoverageGap: true }
    });
    expect(validateCourseRuntime(routeOnlyRuntime, knowledgeRepository, globalKnowledgeAccess)).toBe(true);
  });

  it("still rejects an AssignmentCoverage with a dangling Assignment", () => {
    const invalid = {
      ...routeOnlyRuntime,
      assignments: [{
        id: "existing-assignment",
        courseId: routeOnlyRuntime.course.id,
        order: 0,
        title: "Existing Assignment",
        description: "A valid Assignment definition",
        requirements: ["Complete it"],
        expectedOutput: "Result",
        acceptanceCriteria: ["Valid result"],
        mode: "instruction" as const
      }],
      assignmentCoverages: [{ id: "dangling-assignment-coverage", assignmentId: "missing-assignment", nodeId: "route-knowledge", role: "practice" as const }]
    };
    expect(() => validateCourseRuntime(invalid, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references unknown Assignment/);
  });

  it("rejects a Course with no Knowledge route", () => {
    expect(() => validateCourseRuntime({
      ...routeOnlyRuntime,
      curriculumCoverages: []
    }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/at least one CurriculumCoverage Knowledge route/);
  });

  it("accepts an incomplete Draft with no Knowledge route or optional assets", () => {
    const draft = { ...routeOnlyRuntime, course: { ...routeOnlyRuntime.course, lifecycle: "draft" as const }, curriculumCoverages: [] };

    expect(validateCourseIntegrity(draft, knowledgeRepository, globalKnowledgeAccess)).toBe(true);
    expect(draft.materials).toEqual([]);
    expect(draft.assignments).toEqual([]);
    const graphData = buildCourseGraphData(draft, { userId: "admin", courseId: draft.course.id, isActive: false, assignmentStates: {}, materialStates: {}, updatedAt: "2026-08-25T00:00:00.000Z" }, routeOnlyKnowledgeGraph);
    expect(graphData.chapters).toHaveLength(1);
    expect(graphData.knowledgeNodes).toEqual([]);
  });

  it("accepts an owner-scoped published Personal Course with explicit target Knowledge", () => {
    const personal = {
      ...routeOnlyRuntime,
      course: { ...routeOnlyRuntime.course, id: "personal-course", courseType: "personal" as const, ownerUserId: "learner", sourceCourseId: "standard-source", lifecycle: "published" as const },
      curriculum: { ...routeOnlyRuntime.curriculum, courseId: "personal-course" },
      chapters: routeOnlyRuntime.chapters.map((chapter) => ({ ...chapter, courseId: "personal-course" })),
      lessons: routeOnlyRuntime.lessons.map((lesson) => ({ ...lesson, courseId: "personal-course" })),
      curriculumCoverages: routeOnlyRuntime.curriculumCoverages.map((coverage) => ({ ...coverage, courseId: "personal-course" })),
      targetKnowledge: [{ courseId: "personal-course", nodeId: "route-knowledge", required: true }]
    };

    expect(validateCourseRuntime(personal, knowledgeRepository, globalKnowledgeAccess)).toBe(true);
    expect(validateCourseIntegrity({ ...personal, course: { ...personal.course, lifecycle: "draft" as const } }, knowledgeRepository, globalKnowledgeAccess)).toBe(true);
  });

  it("rejects Personal Course ownership and target-scope violations", () => {
    expect(() => validateCourseRuntime({ ...routeOnlyRuntime, course: { ...routeOnlyRuntime.course, courseType: "personal" as const } }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/requires an owner/);
    expect(() => validateCourseRuntime({ ...routeOnlyRuntime, course: { ...routeOnlyRuntime.course, courseType: "personal" as const, ownerUserId: "learner" } }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/requires target Knowledge/);
    expect(() => validateCourseRuntime({ ...routeOnlyRuntime, targetKnowledge: [{ courseId: routeOnlyRuntime.course.id, nodeId: "missing-target", required: true }] }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/unknown or invisible KnowledgeNode/);
  });

  it("still rejects broken references in an incomplete Draft", () => {
    const draft = {
      ...routeOnlyRuntime,
      course: { ...routeOnlyRuntime.course, lifecycle: "draft" as const },
      lessons: routeOnlyRuntime.lessons.map((lesson) => ({ ...lesson, chapterId: "missing-chapter" })),
      curriculumCoverages: []
    };

    expect(() => validateCourseIntegrity(draft, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references unknown Chapter/);
  });

  it("rejects duplicate course Material order, invalid Segment, and invalid Knowledge references", () => {
    const material = { id: "route-material", courseId: routeOnlyRuntime.course.id, order: 0, title: "Route material", type: "article" as const, segments: [{ id: "route-segment", order: 0 }] };
    expect(() => validateCourseRuntime({ ...routeOnlyRuntime, materials: [material, { ...material, id: "route-material-2" }] }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/Material in Course .* orders must be unique/);
    expect(() => validateCourseRuntime({
      ...routeOnlyRuntime,
      materials: [material],
      materialKnowledgeCoverages: [{ id: "bad-segment", materialId: material.id, segmentId: "missing-segment", nodeId: "route-knowledge", role: "explain" }]
    }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references unknown Segment/);
    expect(() => validateCourseRuntime({
      ...routeOnlyRuntime,
      materials: [material],
      materialKnowledgeCoverages: [{ id: "bad-node", materialId: material.id, segmentId: "route-segment", nodeId: "missing-knowledge", role: "explain" }]
    }, knowledgeRepository, globalKnowledgeAccess)).toThrow(/references a node outside the Course/);
  });

  it("accepts managed PDF metadata without a temporary runtime URL", () => {
    const managedPdf = {
      id: "managed-pdf", courseId: routeOnlyRuntime.course.id, order: 0,
      title: "Managed PDF", type: "pdf" as const, source: { kind: "pdf" as const, pageCount: 1 },
      segments: [{ id: "page-1", order: 0, page: 1 }]
    };

    expect(validateCourseRuntime({ ...routeOnlyRuntime, materials: [managedPdf] }, knowledgeRepository, globalKnowledgeAccess)).toBe(true);
  });
});

it('allows Assignment coverage of factual Bridge ancestors while preserving curriculum and rejecting unrelated Knowledge',()=>{
 const root=routeOnlyKnowledgeGraph.nodes[0];
 const graph={...routeOnlyKnowledgeGraph,nodes:[root,{...root,id:'bridge'},{...root,id:'upstream'},{...root,id:'unrelated'}],edges:[{id:'support',source:'bridge',target:root.id,relation:'enables' as const,strength:0.8,reason:'Real support'},{id:'hard',source:'upstream',target:'bridge',relation:'prerequisite' as const,strength:'hard' as const,reason:'Real prerequisite'}]};
 const runtime={...routeOnlyRuntime,assignments:[{id:'prepare',courseId:routeOnlyRuntime.course.id,order:0,title:'Prepare support',description:'Trace support',requirements:[],expectedOutput:'Trace',acceptanceCriteria:[],mode:'instruction' as const}],assignmentCoverages:[{id:'support-coverage',assignmentId:'prepare',nodeId:'upstream',role:'practice' as const}]};
 const repository=new InMemoryKnowledgeRepository(graph);expect(validateCourseRuntime(runtime,repository,globalKnowledgeAccess)).toBe(true);expect(buildCourseGraphData(runtime,undefined,graph).knowledgeNodes.map(n=>n.id)).toEqual([root.id]);
 for(const nodeId of ['unrelated','missing'])expect(()=>validateCourseRuntime({...runtime,assignmentCoverages:[{...runtime.assignmentCoverages[0],nodeId}]},repository,globalKnowledgeAccess)).toThrow(/outside the Course/);
 expect(()=>validateCourseRuntime(runtime,new InMemoryKnowledgeRepository({...graph,nodes:graph.nodes.map(n=>n.id==='upstream'?{...n,status:'deprecated' as const}:n)}),globalKnowledgeAccess)).toThrow(/invisible KnowledgeNode/);
});

it('rejects related-only Bridge and Bridge ancestry through an inaccessible intermediate node',()=>{
 const root=routeOnlyKnowledgeGraph.nodes[0];const runtime={...routeOnlyRuntime,assignments:[{id:'prepare',courseId:routeOnlyRuntime.course.id,order:0,title:'Prepare support',description:'Trace support',requirements:[],expectedOutput:'Trace',acceptanceCriteria:[],mode:'instruction' as const}],assignmentCoverages:[{id:'coverage',assignmentId:'prepare',nodeId:'upstream',role:'practice' as const}]};
 const related={...routeOnlyKnowledgeGraph,nodes:[root,{...root,id:'upstream'}],edges:[{id:'related',source:'upstream',target:root.id,relation:'related' as const,strength:0.8,reason:'Related only'}]};expect(()=>validateCourseRuntime(runtime,new InMemoryKnowledgeRepository(related),globalKnowledgeAccess)).toThrow(/outside the Course/);
 const hidden={...routeOnlyKnowledgeGraph,nodes:[root,{...root,id:'upstream'},{...root,id:'middle',scope:'user' as const,ownerId:'another-user'}],edges:[{id:'a',source:'upstream',target:'middle',relation:'enables' as const,strength:0.8,reason:'Support'},{id:'b',source:'middle',target:root.id,relation:'enables' as const,strength:0.8,reason:'Support'}]};expect(()=>validateCourseRuntime(runtime,new InMemoryKnowledgeRepository(hidden),globalKnowledgeAccess)).toThrow(/outside the Course/);
});
