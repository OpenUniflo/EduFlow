import type { MicroLearningPath, MicroLearningProvider, MicroStep } from "@/features/learning/micro/microLearning";
import type { FlowDefinition, SimulationDefinition, TransformationDefinition } from "@/shared/learning/microMechanisms";

export const syntheticFlow: FlowDefinition = {
  type: "flow-execution",
  mode: "explore",
  teaching: {
    explanation: "Follow the synthetic request, tool call, result return, and final answer path.",
    feedback: {
      "missing-required-edge": "缺少必要的数据连接：结果必须回传后才能继续。",
      "unexpected-edge": "这条额外连接跳过了模型读取观测的步骤。",
      "invalid-edge": "当前定义没有这条消息通路。"
    }
  },
  nodes: [
    { id: "user", label: "User request", x: 0, y: 30 },
    { id: "model", label: "Model", x: 230, y: 30 },
    { id: "tool", label: "Framework tool", x: 470, y: 170 },
    { id: "final", label: "Final answer", x: 470, y: -90 }
  ],
  edges: [
    { id: "request", from: "user", to: "model", label: "request" },
    { id: "call", from: "model", to: "tool", label: "tool call" },
    { id: "result", from: "tool", to: "model", label: "result 回传" },
    { id: "answer", from: "model", to: "final", label: "answer" },
    { id: "shortcut", from: "tool", to: "final", label: "shortcut" }
  ],
  initialEdgeIds: ["request", "call", "result", "answer"],
  correctEdgeIds: ["request", "call", "result", "answer"],
  events: [
    { nodeId: "user", title: "1 · Request", message: "Synthetic user request.", explanation: "The synthetic request starts the flow." },
    { nodeId: "model", edgeId: "request", title: "2 · Decide", message: "Synthetic tool call.", explanation: "The model emits a tool call." },
    { nodeId: "tool", edgeId: "call", title: "3 · Execute", message: "Synthetic tool result.", explanation: "The framework executes the tool." },
    { nodeId: "model", edgeId: "result", title: "4 · Observe", message: "Synthetic result return.", explanation: "The result must return to the model." },
    { nodeId: "final", edgeId: "answer", title: "5 · Answer", message: "Synthetic final answer.", explanation: "The model returns the final answer." }
  ]
};

export const syntheticSimulation: SimulationDefinition = {
  type: "simulation",
  mode: "explore",
  teaching: {
    explanation: "Synthetic quadratic descent used to test parameter updates.",
    feedback: {
      slow: "The synthetic trajectory moves slowly.",
      oscillating: "The synthetic trajectory crosses the minimum.",
      diverging: "The synthetic trajectory grows.",
      converged: "The synthetic trajectory settles near the minimum."
    }
  },
  parameter: { label: "Synthetic rate", min: 0.02, max: 1.4, step: 0.02, initial: 0.1 },
  model: { kind: "quadratic-descent", curvature: 2, optimum: 0, initial: 4, steps: 12 },
  target: { maxLoss: 0.02, maxGrowth: 1 }
};

export const syntheticTransformation: TransformationDefinition = {
  type: "data-transform",
  mode: "explore",
  teaching: {
    explanation: "Synthetic co-occurrence counting over a tiny corpus.",
    feedback: {
      "wrong-matrix-cell": "Count only synthetic window events.",
      "current-event": "Use the center row and context column.",
      completed: "Every synthetic count comes from an event."
    }
  },
  corpus: [["a", "b"], ["a", "b", "c"], ["b", "c"]],
  vocabulary: ["a", "b", "c"],
  window: 1
};

function step(id: string, kind: MicroStep["kind"], title: string, body: string, interaction?: MicroStep["interaction"], successFeedback?: string, retryFeedback?: string): MicroStep {
  return { id, kind, title, body, interaction, successFeedback, retryFeedback: retryFeedback ?? (interaction && "teaching" in interaction ? interaction.teaching?.explanation : undefined) };
}

function path(id: string, knowledgeId: string, title: string, mechanism: FlowDefinition | SimulationDefinition | TransformationDefinition, interactionKind: MicroStep["kind"] = "interaction"): MicroLearningPath {
  return {
    id,
    knowledgeId,
    courseId: "fixture-course-alpha",
    scope: "course",
    title,
    description: "Synthetic Micro path used by rule tests.",
    estimatedMinutes: 5,
    mode: "learn",
    required: true,
    status: "published",
    units: [{
      id: `${id}-unit`,
      pathId: id,
      title,
      position: 0,
      estimatedMinutes: 5,
      required: true,
      steps: [
        step(`${id}-explain`, "explanation", "Synthetic explanation", "Read the synthetic mechanism before practicing."),
        step(`${id}-interaction`, interactionKind, "Synthetic interaction", "Manipulate the synthetic mechanism.", mechanism, "Synthetic success.", "Review the synthetic mechanism and try again."),
        step(`${id}-application`, "application", "Synthetic application", "Apply the same rule in a second synthetic context.", { ...mechanism, mode: "challenge" } as typeof mechanism, "Synthetic application complete.", "Check the synthetic causal chain again."),
        step(`${id}-summary`, "summary", "Synthetic summary", "The synthetic rule is now checkable.")
      ]
    }]
  };
}

export const syntheticMicroPaths: MicroLearningPath[] = [
  path("fixture-micro-flow", "syn-a", "Synthetic Flow", syntheticFlow),
  path("fixture-micro-simulation", "syn-b", "Synthetic Simulation", syntheticSimulation),
  path("fixture-micro-transformation", "syn-c", "Synthetic Transformation", syntheticTransformation)
];

export const syntheticMicroProvider: MicroLearningProvider = {
  getLesson(knowledgeId, context) {
    const path = syntheticMicroPaths.find((item) => item.knowledgeId === knowledgeId && (!context?.courseId || item.courseId === context.courseId));
    if (!path) return null;
    return { id: path.id, knowledgeId: path.knowledgeId, title: path.title, estimatedMinutes: path.estimatedMinutes, mode: path.mode, steps: path.units[0].steps };
  },
  listSupportedKnowledgeIds() {
    return syntheticMicroPaths.map((item) => item.knowledgeId);
  }
};
