export type CourseCreatorIntent = "navigate" | "explain" | "edit";

const navigationPhrases = new Set([
  "下一步", "继续", "可以", "可以了", "确认", "没问题", "就这样",
  "next", "continue", "confirm", "looks good", "that's fine", "done"
]);

export function classifyCourseCreatorIntent(instruction: string): CourseCreatorIntent {
  const normalized = instruction.normalize("NFKC").trim().toLocaleLowerCase().replace(/[。！？!?.,，]/g, "").trim();
  if (navigationPhrases.has(normalized)) return "navigate";
  const editCue = /(?:加入|添加|增加|删|移除|去掉|减少|精简|调整|修改|改成|提前|推后|重新|更多|少一点|多一点|set|add|remove|delete|change|edit|move|reorder|shorter|more|less)/iu.test(normalized);
  const explanationCue = /(?:为什么|为何|是什么|什么意思|怎么理解|解释|有何用|作用|why|what is|explain|how does|meaning)/iu.test(normalized);
  return explanationCue && !editCue ? "explain" : "edit";
}
