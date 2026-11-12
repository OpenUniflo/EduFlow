import { BookOpen, Plus, Search, Users } from "lucide-react";
import type { MouseEvent } from "react";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";

function shortName(person: FollowedPerson) {
  return person.displayName.replace(/^示例\s*·\s*/, "");
}

export function ArchivePeopleBar({ sessionName, people, selectedIds, courseCount, coursesOpen, onToggleMe, onTogglePerson, onOpenPeople, onOpenSearch, onOpenCourses }: {
  sessionName: string;
  people: readonly FollowedPerson[];
  selectedIds: readonly string[];
  courseCount: number;
  coursesOpen: boolean;
  onToggleMe: (shift: boolean) => void;
  onTogglePerson: (person: FollowedPerson, shift: boolean) => void;
  onOpenPeople: () => void;
  onOpenSearch: () => void;
  onOpenCourses: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const meActive = selectedIds.includes("me");
  return (
    <nav className="ef-atlas-people ef-ui-glass ef-ui-glass--regular" role="toolbar" aria-label="地图人物">
      <button type="button" className="ef-atlas-people-social" onClick={onOpenPeople} aria-label="人与分享" title="人与分享">
        <Users size={18} aria-hidden />
      </button>
      <span className="ef-atlas-people-sep" aria-hidden />
      <button type="button" className={`ef-atlas-person-pill ${meActive ? "is-on" : ""}`} aria-pressed={meActive} onClick={(event) => onToggleMe(event.shiftKey)} title="我的地图（按住 Shift 可多选对比）">
        <Avatar name={sessionName} size={24} personColor="me" decorative />
        <span>我</span>
      </button>
      {people.filter((person) => person.sample).slice(0, 4).map((person) => {
        const active = selectedIds.includes(person.id);
        return (
          <button type="button" key={person.id} className={`ef-atlas-person-pill ${active ? "is-on" : ""}`} aria-pressed={active} onClick={(event) => onTogglePerson(person, event.shiftKey)} title={`${shortName(person)} 的地图（按住 Shift 可多选对比）`} data-preview="sample">
            <Avatar name={shortName(person)} size={24} personColor={person.accent as "me" | "orange" | "cyan" | "rose"} decorative />
            <span>{shortName(person)}</span>
          </button>
        );
      })}
      <button type="button" className="ef-atlas-people-add" onClick={onOpenPeople} aria-label="添加关注的人" title="添加关注的人"><Plus size={15} aria-hidden /></button>
      <button type="button" className="ef-atlas-people-courses" aria-pressed={coursesOpen} onClick={onOpenCourses} aria-label={`课程入口，${courseCount} 门`} title="从课程进入地图或课程页"><BookOpen size={15} aria-hidden /><span>课程</span><em>{courseCount}</em></button>
      <button type="button" className="ef-atlas-people-search" onClick={onOpenSearch} aria-label="搜索 ⌘K" title="搜索 ⌘K"><Search size={16} aria-hidden /></button>
      <PreviewBadge className="ef-atlas-people-preview" />
    </nav>
  );
}
