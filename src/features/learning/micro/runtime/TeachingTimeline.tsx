import { useEffect, useReducer } from "react";
import { timelineReducer, scheduleTimelineTick } from "@/shared/learning/microMechanisms";

export function useTeachingTimeline(length: number, disabled = false) {
  const [state, dispatch] = useReducer(timelineReducer, { cursor: 0, playing: false });
  useEffect(() => {
    return scheduleTimelineTick(state, disabled, () => dispatch({ type: "step", length }));
  }, [state.cursor, state.playing, length, disabled]);
  return { ...state, step: () => dispatch({ type: "step", length }), play: () => dispatch({ type: "play", length }), pause: () => dispatch({ type: "pause" }), reset: () => dispatch({ type: "reset" }) };
}
export function TimelineControls({ timeline, length, disabled = false, onStep, onReset }: { timeline: ReturnType<typeof useTeachingTimeline>; length: number; disabled?: boolean; onStep?: () => void; onReset?: () => void }) {
  return <div className="micro-timeline-controls"><button type="button" disabled={disabled || timeline.playing || timeline.cursor >= length} onClick={onStep ?? timeline.step}>单步 Step</button><button type="button" disabled={disabled || timeline.cursor >= length} onClick={timeline.playing ? timeline.pause : timeline.play}>{timeline.playing ? "暂停 Pause" : "播放 Play"}</button><button type="button" disabled={disabled} onClick={onReset ?? timeline.reset}>重置 Reset</button><span aria-live="polite">{timeline.cursor} / {length}</span></div>;
}
