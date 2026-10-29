import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";

/**
 * Minimal Feature Preview dataset. Names, handles and activity are obviously
 * synthetic and must never be presented as real people or real progress.
 */
export const sampleFollowedPeople: readonly FollowedPerson[] = [
  {
    id: "preview-person-aqing",
    displayName: "示例 · 阿青",
    handle: "@preview-aqing",
    accent: "cyan",
    visibility: "public",
    sharedKnowledgeCount: 12,
    activityLabel: "示例进度：3 门课程 · 本周 5 次学习",
    sample: true
  },
  {
    id: "preview-person-xucheng",
    displayName: "示例 · 许澄",
    handle: "@preview-xucheng",
    accent: "rose",
    visibility: "private",
    sharedKnowledgeCount: 4,
    activityLabel: "示例进度：对方未公开学习进度",
    sample: true
  }
];
