export function ProfileEmptyState({ message }: { message?: string }) {
  return <div className="profile-empty glass">{message ?? "还没有能力成长记录，完成一个动手任务任务后这里会自动更新。"}</div>;
}
