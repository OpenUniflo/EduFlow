import { Plus, Users, X } from "lucide-react";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";

function shortName(person: FollowedPerson) {
  return person.displayName.replace(/^示例\s*·\s*/, "");
}

export function ArchivePeopleBar({ sessionName, people, selectedIds, onFitMe, onRemove, onOpenPicker, onOpenReplace, onOpenPeople }: {
  sessionName: string;
  people: readonly FollowedPerson[];
  selectedIds: readonly string[];
  onFitMe: () => void;
  onRemove: (id: string) => void;
  onOpenPicker: () => void;
  onOpenReplace: () => void;
  onOpenPeople: () => void;
}) {
  const selected = selectedIds.flatMap((id) => {
    const person = people.find((candidate) => candidate.id === id);
    return person ? [person] : [];
  });
  return (
    <div className="ef-archive-people" role="toolbar" aria-label="档案人物">
      <button type="button" className="ef-archive-people-social" onClick={onOpenPeople} aria-label="打开人与分享">
        <Users size={18} aria-hidden />
      </button>
      <span className="ef-archive-people-kicker">人</span>
      <button type="button" className={`ef-archive-person ${selected.length ? "" : "is-active"}`} onClick={onFitMe} aria-pressed={selected.length === 0}>
        <Avatar name={sessionName} size={24} personColor="me" decorative />
        <span>我</span>
      </button>
      {selected.map((person) => (
        <span className={`ef-archive-person is-active ef-archive-person--${person.accent}`} key={person.id} data-preview="sample">
          <button type="button" className="ef-archive-person-main" onClick={onOpenPeople} title={person.displayName}>
            <Avatar name={shortName(person)} size={24} personColor={person.accent} decorative />
            <span>{shortName(person)}</span>
          </button>
          <button type="button" className="ef-archive-person-x" onClick={() => onRemove(person.id)} aria-label={`移除 ${shortName(person)}`}><X size={12} aria-hidden /></button>
        </span>
      ))}
      <button type="button" className="ef-archive-person-add" onClick={selected.length >= 3 ? onOpenReplace : onOpenPicker} aria-label={selected.length >= 3 ? "替换谁" : "加入对比"} title={selected.length >= 3 ? "替换谁" : "加入对比"}>
        <Plus size={14} aria-hidden />
        <span>{selected.length >= 3 ? "替换谁" : "添加"}</span>
      </button>
      <span className="ef-archive-people-count">{selected.length + 1}/4</span>
      <PreviewBadge className="ef-archive-people-preview" />
    </div>
  );
}
