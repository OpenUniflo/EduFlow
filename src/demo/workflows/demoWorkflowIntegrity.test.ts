import { describe, expect, it } from "vitest";
import { applicationServices } from "@/app/services/applicationServices";
import { isControlNode } from "@/features/workflow/domain/graphOperations";
import { demoWorkflowTemplates } from "./demoWorkflowTemplates";

describe("Demo Workflow integrity", () => {
  it("resolves every Demo Course Workflow Assignment to an existing Template", () => {
    const templateIds = new Set(demoWorkflowTemplates.map((template) => template.id));
    const missing = applicationServices.courseRepository.listCourseRuntimes().flatMap((runtime) => runtime.assignments
      .filter((assignment) => assignment.mode === "workflow" && (!assignment.workflowTemplateId || !templateIds.has(assignment.workflowTemplateId)))
      .map((assignment) => ({ courseId: runtime.course.id, assignmentId: assignment.id, workflowTemplateId: assignment.workflowTemplateId })));
    expect(missing).toEqual([]);
  });

  it("keeps Template, graph, run-order, and control identities structurally valid", () => {
    const templateIds = demoWorkflowTemplates.map((template) => template.id);
    expect(new Set(templateIds).size).toBe(templateIds.length);

    for (const template of demoWorkflowTemplates) {
      const nodeIds = template.nodes.map((node) => node.id);
      const edgeIds = template.edges.map((edge) => edge.id);
      const allowedRunItems = new Set([...nodeIds, ...edgeIds]);
      expect(new Set(nodeIds).size, `${template.id}: duplicate node ID`).toBe(nodeIds.length);
      expect(new Set(edgeIds).size, `${template.id}: duplicate edge ID`).toBe(edgeIds.length);
      expect(template.edges.filter((edge) => !nodeIds.includes(edge.from) || !nodeIds.includes(edge.to)), `${template.id}: dangling edge`).toEqual([]);
      expect(template.runOrder.filter((item) => !allowedRunItems.has(item)), `${template.id}: invalid runOrder item`).toEqual([]);

      for (const node of template.nodes.filter(isControlNode)) {
        const outgoingLabels = new Set(template.edges.filter((edge) => edge.from === node.id && edge.label !== "next").map((edge) => edge.label));
        expect(new Set(node.control?.branches ?? []), `${template.id}/${node.id}: control branches`).toEqual(outgoingLabels);
      }
    }
  });
});
