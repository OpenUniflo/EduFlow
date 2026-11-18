import { Clock, History, X } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchRecords } from "@/features/records/recordsApi";
import { RECORD_TYPE_LABELS, formatRecordTimestamp, recordStatusLabel } from "@/features/records/recordsFormat";
import type { RecordsResponse } from "@/shared/learning/records";
import { PanelActions } from "./PanelActions";

function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"; }
  catch { return "Asia/Shanghai"; }
}

/** The record overview lives beside the conversation; the page is one click away. */
export function RecordsPanel({ onClose }: { onClose(): void }) {
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const timeZone = browserTimeZone();

  useEffect(() => {
    let live = true;
    setError("");
    void fetchRecords({ types: [], courseId: null, range: "all", timeZone, limit: 8 }).then((value) => {
      if (live) setData(value);
    }).catch((reason) => {
      if (live) setError(reason instanceof Error ? reason.message : "记录暂时无法加载。");
    });
    return () => { live = false; };
  }, [retry, timeZone]);

  return <aside className="ef-object-panel" aria-label="记录面板">
    <header className="ef-object-panel-head">
      <span className="ef-object-panel-icon" aria-hidden="true"><History size={16} /></span>
      <div><span>学习记录</span><h2>最近发生的事</h2></div>
      <button type="button" className="ef-home-icon" onClick={onClose} aria-label="关闭记录面板"><X size={15} /></button>
    </header>
    <div className="ef-object-panel-body">
      {data ? <div className="ef-rec-panel-summary">
        <span><b>{data.summary.totalActivities}</b><small>次活动</small></span>
        <span><b>{data.summary.learningDays}</b><small>个学习日</small></span>
        <span><b>{data.summary.currentStreak}</b><small>连续天数</small></span>
      </div> : null}
      {error ? <div className="ef-object-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></div> : null}
      {!data && !error ? <p className="ef-object-empty" role="status">正在读取学习记录…</p> : null}
      {data && !data.events.length ? <p className="ef-object-empty">还没有学习记录。</p> : null}
      {data?.events.length ? <ul className="ef-rec-panel-list">
        {data.events.map((event) => <li key={event.id}>
          <span className="ef-object-kicker">{RECORD_TYPE_LABELS[event.type]}</span>
          <strong>{event.title}</strong>
          <small><Clock size={11} aria-hidden="true" />{formatRecordTimestamp(event.occurredAt, timeZone)} · {recordStatusLabel(event)}</small>
        </li>)}
      </ul> : null}
    </div>
    <footer className="ef-object-panel-foot"><span>只显示你自己的记录</span><PanelActions expand={{ kind: "page", href: "/records" }} /></footer>
  </aside>;
}
