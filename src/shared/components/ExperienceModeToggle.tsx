export type ExperienceMode = "learn" | "design";

export function ExperienceModeToggle({ value, onChange }: { value: ExperienceMode; onChange(value: ExperienceMode): void }) {
  return <div className="experience-mode-toggle" role="group" aria-label="课程体验模式">
    <button type="button" className={value === "learn" ? "active" : ""} aria-pressed={value === "learn"} onClick={() => onChange("learn")}>学习模式</button>
    <button type="button" className={value === "design" ? "active" : ""} aria-pressed={value === "design"} onClick={() => onChange("design")}>课程设计</button>
  </div>;
}
