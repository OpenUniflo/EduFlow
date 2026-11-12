import { Maximize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { courseEntryState, type CourseEntrySource } from "@/features/course/pages/courseEntry";

/**
 * Every panel declares exactly one expand destination:
 * - a dedicated page URL, or
 * - an overlay opener when the object has no dedicated page.
 *
 * The component owns the label, placement and return-to-conversation state, so
 * panels cannot grow their own "放大" plus "进入页面" pair.
 */
export type PanelExpandTarget =
  | { kind: "page"; href: string; courseEntry?: { source: CourseEntrySource; returnTo: string } }
  | { kind: "overlay"; onOpen(): void }
  | { kind: "none" };

export function PanelActions({ expand }: { expand: PanelExpandTarget }) {
  const navigate = useNavigate();
  if (expand.kind === "none") return null;
  const open = () => {
    if (expand.kind === "overlay") { expand.onOpen(); return; }
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const returnTo = expand.courseEntry?.returnTo ?? current;
    navigate(expand.href, {
      state: expand.courseEntry ? { ...courseEntryState(expand.courseEntry.source, returnTo), returnTo } : { returnTo }
    });
  };
  return <div className="ef-object-panel-actions">
    <button type="button" className="ef-ui-btn ef-ui-btn--primary ef-ui-btn--32" onClick={open}><Maximize2 size={13} aria-hidden="true" />放大</button>
  </div>;
}
