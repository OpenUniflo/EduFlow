import { useEffect, useId, useReducer } from "react";
import { timelineReducer, scheduleTimelineTick } from "@/shared/learning/microMechanisms";

export function useTeachingTimeline(length: number, disabled = false) {
  const [state, dispatch] = useReducer(timelineReducer, { cursor: 0, playing: false });
  useEffect(() => {
    return scheduleTimelineTick(state, disabled, () => dispatch({ type: "step", length }));
  }, [state.cursor, state.playing, length, disabled]);
  return { ...state, step: () => dispatch({ type: "step", length }), play: () => dispatch({ type: "play", length }), pause: () => dispatch({ type: "pause" }), reset: () => dispatch({ type: "reset" }) };
}
export function TimelineControls({ timeline, length, disabled = false, disabledReason, onStep, onReset }: { timeline: ReturnType<typeof useTeachingTimeline>; length: number; disabled?: boolean; disabledReason?: string; onStep?: () => void; onReset?: () => void }) {
  const reasonId = useId();
  const exhausted = timeline.cursor >= length;
  const reason = disabledReason ?? (exhausted ? "已到当前互动的最后一步；需要先完成当前交互。" : undefined);
  const describedBy = reason && (disabled || exhausted) ? reasonId : undefined;
  return <div className="micro-timeline-controls"><button type="button" disabled={disabled || timeline.playing || exhausted} aria-describedby={describedBy} onClick={onStep ?? timeline.step}>单步</button><button type="button" disabled={disabled || exhausted} onClick={timeline.playing ? timeline.pause : timeline.play}>{timeline.playing ? "暂停" : "播放"}</button><button type="button" disabled={disabled} onClick={onReset ?? timeline.reset}>重置</button><span aria-live="polite">{timeline.cursor} / {length}</span>{describedBy ? <span id={reasonId} className="micro-timeline-reason" role="status">{reason}</span> : null}</div>;
}
