/** Learner-facing, one-line labels for real tool progress. Never a model string. */
export const assistantToolLabels: Record<string, string> = {
  planLearningGoal: "整理学习目标",
  getNavigationDecision: "确认下一步",
  searchKnowledge: "查找知识点",
  getKnowledge: "读取知识点",
  getKnowledgeNeighbors: "查看知识关联",
  searchCourses: "查找课程",
  getCourseContext: "读取课程路线",
  getMaterialContext: "读取资料",
  searchMaterialContent: "查找资料片段",
  getAssignmentContext: "读取任务要求",
  searchMicro: "查找小练习",
  getMicroContext: "读取小练习",
  searchMaterials: "查找资料",
  getLearnerState: "读取学习进度",
  getPracticeReviewContext: "读取这次提交",
  getEvidenceContext: "读取学习记录",
  getCurrentContext: "读取当前对象",
  submitAssignment: "提交动手任务",
  withdrawAssignmentSubmission: "撤回提交",
  openWorkspacePanel: "打开面板"
};

export function assistantToolLabel(toolName: string) {
  return assistantToolLabels[toolName] ?? "读取产品数据";
}
