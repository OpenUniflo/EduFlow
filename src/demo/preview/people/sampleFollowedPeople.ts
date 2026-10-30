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
    id: "preview-person-xiaowang",
    displayName: "示例 · 小王",
    handle: "@preview-xiaowang",
    accent: "orange",
    visibility: "public",
    sharedKnowledgeCount: 9,
    activityLabel: "示例进度：2 门课程 · 本周 3 次学习",
    sample: true
  },
  {
    id: "preview-person-chenyi",
    displayName: "示例 · 陈一",
    handle: "@preview-chenyi",
    accent: "rose",
    visibility: "public",
    sharedKnowledgeCount: 7,
    activityLabel: "示例进度：1 门课程 · 本周 2 次学习",
    sample: true
  },
  {
    id: "preview-person-zhouran",
    displayName: "示例 · 周然",
    handle: "@preview-zhouran",
    accent: "cyan",
    visibility: "public",
    sharedKnowledgeCount: 14,
    activityLabel: "示例进度：3 门课程 · 本周 6 次学习",
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
