import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import type { UserKnowledgeRecord } from "@/features/profile/types";

export type PanelSource = "real" | "preview";

export type PanelCourseItem = {
  id: string;
  title: string;
  progress: number;
  nextLabel: string;
  active: boolean;
  draft: boolean;
  source: PanelSource;
};

export type PanelRecentItem = {
  id: string;
  title: string;
  detail: string;
  updatedAt?: string;
  source: PanelSource;
};

export type PanelPracticeItem = {
  id: string;
  courseId: string;
  title: string;
  status: string;
  source: PanelSource;
};

export type PanelTeacherReminder = {
  id: string;
  label: string;
  count: number;
  source: PanelSource;
};

export type PanelPeopleView = {
  source: PanelSource;
  people: readonly FollowedPerson[];
  selected: FollowedPerson | null;
  state: "list" | "empty" | "visible" | "private";
  marker: string | null;
};

export type MyPanelModel = {
  courses: PanelCourseItem[];
  recent: PanelRecentItem[];
  practices: PanelPracticeItem[];
  archive: {
    source: PanelSource;
    learned: number;
    learning: number;
    practicing: number;
    mastered: number;
    recentTitle?: string;
  };
  teacherReminders: PanelTeacherReminder[];
  people: PanelPeopleView;
};

export function panelSectionSource(section: "courses" | "recent" | "practices" | "archive" | "teacher" | "people"): PanelSource {
  return section === "people" ? "preview" : "real";
}

const statusLabels: Record<string, string> = {
  learning: "学习中",
  learned: "已学习",
  practicing: "实训中"
};

export function buildPanelPeople(input: {
  people: readonly FollowedPerson[];
  selectedPersonId?: string | null;
}): PanelPeopleView {
  const selected = input.selectedPersonId ? input.people.find((person) => person.id === input.selectedPersonId) ?? null : null;
  const source = panelSectionSource("people");
  if (!input.people.length) return { source, people: [], selected: null, state: "empty", marker: "真实空态" };
  if (selected) {
    return {
      source,
      people: input.people,
      selected,
      state: selected.visibility === "private" ? "private" : "visible",
      marker: "预览 · 示例数据"
    };
  }
  return { source, people: input.people, selected: null, state: "list", marker: "预览 · 示例数据" };
}

export function buildRecentLearning(records: readonly UserKnowledgeRecord[], nodeTitles: ReadonlyMap<string, string>, limit = 4): PanelRecentItem[] {
  return [...records]
    .filter((record) => record.status !== "explore")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.nodeId.localeCompare(right.nodeId))
    .slice(0, limit)
    .map((record) => ({
      id: record.nodeId,
      title: nodeTitles.get(record.nodeId) ?? record.nodeId,
      detail: statusLabels[record.status] ?? record.status,
      updatedAt: record.updatedAt,
      source: panelSectionSource("recent")
    }));
}

export function buildArchiveSummary(records: readonly UserKnowledgeRecord[], nodeTitles: ReadonlyMap<string, string>) {
  const count = (status: UserKnowledgeRecord["status"]) => records.filter((record) => record.status === status).length;
  const recent = [...records].filter((record) => record.status !== "explore").sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0];
  return {
    source: panelSectionSource("archive"),
    learned: count("learned"),
    learning: count("learning"),
    practicing: count("practicing"),
    mastered: count("mastered"),
    recentTitle: recent ? nodeTitles.get(recent.nodeId) ?? recent.nodeId : undefined,
    recentNodeId: recent?.nodeId
  };
}

export function buildTeacherReminders(submissions: ReadonlyArray<{ status: string; learnerName: string }>): PanelTeacherReminder[] {
  const pending = submissions.filter((item) => item.status === "submitted" || item.status === "needs_revision");
  if (!pending.length) return [];
  return [
    {
      id: "pending-practices",
      label: `待审核实践 · ${pending.length} 项`,
      count: pending.length,
      source: panelSectionSource("teacher")
    }
  ];
}
