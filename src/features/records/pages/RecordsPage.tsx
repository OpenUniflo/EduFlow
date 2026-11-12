import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  History,
  Route,
  Sparkles
} from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { Pill } from "@/shared/ui/Pill";
import {
  DEFAULT_RECORD_TIME_ZONE,
  RECORD_EVENT_TYPES,
  activityLevel,
  dateKeyInTimeZone,
  formatMonth,
  formatTimeInTimeZone,
  groupRecordEventsByDay,
  monthLabelsForDays,
  type RecordDay,
  type RecordEvent,
  type RecordEventType,
  type RecordRange,
  type RecordsResponse
} from "@/shared/learning/records";
import { fetchAllRecords, fetchRecords } from "../recordsApi";
import {
  RECORD_TYPE_LABELS,
  buildRecordsCsv,
  downloadCsvFile,
  formatRecordDateRange,
  formatRecordDayHeading,
  formatRecordFullDate,
  recordMetaParts,
  recordStatusLabel,
  recordStatusTone
} from "../recordsFormat";
import "./recordsPage.css";

const RANGE_LABELS: Record<RecordRange, string> = {
  today: "今天",
  week: "本周",
  last30: "近 30 天",
  all: "全部"
};

function parseTypes(value: string | null): RecordEventType[] {
  if (!value) return [];
  const selected = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
  return RECORD_EVENT_TYPES.filter((type) => selected.has(type));
}

function parseRange(value: string | null): RecordRange {
  return value === "today" || value === "week" || value === "last30" ? value : "all";
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_RECORD_TIME_ZONE;
  } catch {
    return DEFAULT_RECORD_TIME_ZONE;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "记录暂时无法加载，请稍后重试。";
}

export function RecordsPage() {
  const location = useLocation();
  const requestedReturn = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof requestedReturn === "string" && /^\/(?!\/)/.test(requestedReturn) ? requestedReturn : null;
  const [params, setParams] = useSearchParams();
  const timeZone = useMemo(browserTimeZone, []);
  const typesParam = params.get("types") ?? "";
  const types = useMemo(() => parseTypes(typesParam), [typesParam]);
  const range = parseRange(params.get("range"));
  const courseId = params.get("course");
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [today] = useState(() => dateKeyInTimeZone(new Date().toISOString(), timeZone));

  const request = useMemo(() => ({ types, courseId, range, timeZone }), [types, courseId, range, timeZone]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setExpandedId(null);
    setMoreError("");
    fetchRecords({ ...request, limit: 10 }).then((result) => {
      if (!active) return;
      setData(result);
      setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setError(errorMessage(reason));
      setLoading(false);
    });
    return () => { active = false; };
  }, [request, retry]);

  const groups = useMemo(() => groupRecordEventsByDay(data?.events ?? [], timeZone), [data?.events, timeZone]);
  const summary = data?.summary;
  const monthLabels = useMemo(() => summary ? monthLabelsForDays(summary.days) : [], [summary]);
  const filtering = types.length > 0 || Boolean(courseId) || range !== "all";
  const resetDisabled = !filtering;

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setExportStatus("");
  }

  function toggleType(type: RecordEventType) {
    const next = new Set(types);
    if (next.has(type)) next.delete(type); else next.add(type);
    updateParam("types", RECORD_EVENT_TYPES.filter((item) => next.has(item)).join(","));
  }

  function resetFilters() {
    setParams({}, { replace: true });
    setExportStatus("");
  }

  async function loadMore() {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = await fetchRecords({ ...request, cursor: data.nextCursor, limit: 10 });
      setData((current) => {
        if (!current) return next;
        const seen = new Set(current.events.map((event) => event.id));
        return { ...next, events: [...current.events, ...next.events.filter((event) => !seen.has(event.id))] };
      });
    } catch {
      setMoreError("更早的记录加载失败，请重试。");
    } finally {
      setLoadingMore(false);
    }
  }

  async function exportRecords() {
    if (exporting) return;
    setExporting(true);
    setExportStatus("");
    try {
      const events = await fetchAllRecords({ ...request, limit: 50 });
      const csv = buildRecordsCsv(events, timeZone);
      downloadCsvFile(csv.fileName, csv.content);
      setExportStatus(`已导出 ${csv.rowCount} 条记录（${csv.columnCount} 列）`);
    } catch {
      setExportStatus("导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }

  return <main className="ef-rec-page">
    <header className="ef-rec-head">
      <div className="ef-rec-copy">
        <nav className="ef-rec-crumb" aria-label="面包屑"><Link to={returnTo ?? "/"}>{returnTo ? "返回对话" : "首页"}</Link><span aria-hidden="true">/</span><b>记录</b></nav>
        <h1>记录</h1>
        <p className="ef-rec-sum" aria-live="polite">
          {error ? <b>记录暂时不可用</b> : loading && !data ? <b>正在读取记录…</b> : <>
            <b>{data?.resultTotal ?? 0} 条记录</b>
            <span className="ef-rec-sep" aria-hidden="true" />
            <span>近 7 天有 {summary?.last7Days ?? 0} 天在学习</span>
          </>}
        </p>
      </div>
      <div className="ef-rec-actions">
        <Button variant="secondary" icon={<Download size={16} aria-hidden="true" />} loading={exporting} onClick={() => void exportRecords()}>导出记录</Button>
        {exportStatus ? <span className="ef-rec-export-status" role="status">{exportStatus}</span> : null}
      </div>
    </header>

    <div className="ef-rec-layout">
      <section className="ef-rec-main" aria-busy={loading || undefined}>
        {error
          ? <section className="ef-rec-state ef-rec-state--error" role="alert">
              <AlertTriangle size={28} aria-hidden="true" />
              <h2>记录暂时无法加载</h2>
              <p>{error}</p>
              <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>重试</Button>
            </section>
          : loading || !data
            ? <RecordsSkeleton />
            : <>
                <HeatmapCard summary={data.summary} monthLabels={monthLabels} />
                <TimelineCard
                  data={data}
                  groups={groups}
                  today={today}
                  expandedId={expandedId}
                  onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
                  loadingMore={loadingMore}
                  moreError={moreError}
                  onLoadMore={() => void loadMore()}
                  filtering={filtering}
                  onReset={resetFilters}
                  returnTo={returnTo}
                />
              </>}
      </section>

      <aside className="ef-rec-side">
        <FilterCard
          data={data}
          types={types}
          range={range}
          courseId={courseId}
          loading={loading}
          resetDisabled={resetDisabled}
          onToggleType={toggleType}
          onClearTypes={() => updateParam("types", "")}
          onCourse={(value) => updateParam("course", value)}
          onRange={(value) => updateParam("range", value)}
          onReset={resetFilters}
        />
      </aside>
    </div>
  </main>;
}

function RecordsSkeleton() {
  return <>
    <div className="ef-rec-skeleton-card" aria-hidden="true">
      <span className="ef-rec-skeleton-line ef-rec-skeleton-line--short" />
      <span className="ef-rec-skeleton-block" />
    </div>
    <div className="ef-rec-skeleton-card" aria-hidden="true">
      <span className="ef-rec-skeleton-line ef-rec-skeleton-line--short" />
      {Array.from({ length: 5 }, (_, index) => <span key={index} className="ef-rec-skeleton-line" />)}
    </div>
  </>;
}

function HeatmapCard({ summary, monthLabels }: {
  summary: RecordsResponse["summary"];
  monthLabels: Array<{ label: string; column: number }>;
}) {
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The current week is the rightmost column. Start at the recent end so a
  // learner never has to discover a hidden horizontal scroll to see today.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [summary.endDate, summary.startDate]);

  function showTip(event: ReactMouseEvent<HTMLSpanElement>, day: RecordDay) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ left: rect.left + rect.width / 2, top: rect.top - 6, text: `${formatRecordFullDate(day.date)} · ${day.count} 次活动` });
  }

  return <article className="ef-rec-heat ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" aria-labelledby="ef-rec-heat-title">
    <div className="ef-rec-heat-head">
      <div className="ef-rec-heat-copy">
        <h2 id="ef-rec-heat-title">学习活动</h2>
        <p>{formatMonth(summary.startDate)} – {formatMonth(summary.endDate)}</p>
      </div>
      <div className="ef-rec-stats">
        <div className="ef-rec-stat"><b>{summary.totalActivities}</b><span>次活动</span></div>
        <div className="ef-rec-stat"><b>{summary.learningDays}</b><span>个学习日</span></div>
        <div className="ef-rec-stat"><b>{summary.currentStreak}</b><span>连续天数</span></div>
        <div className="ef-rec-stat"><b>{summary.monthActivities}</b><span>本月活动</span></div>
      </div>
    </div>
    <div className="ef-rec-legend" aria-hidden="true">
      <span>少</span>
      {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`ef-rec-legend-cell ef-rec-level-${level}`} />)}
      <span>多</span>
    </div>
    <div className="ef-rec-heat-scroll" ref={scrollRef}>
      <div className="ef-rec-heat-wrap">
        <div className="ef-rec-days" aria-hidden="true"><span>一</span><span>三</span><span>五</span></div>
        <div>
          <div className="ef-rec-months" aria-hidden="true">
            {monthLabels.map((month) => <span key={`${month.label}:${month.column}`} style={{ gridColumn: `${month.column} / span ${Math.min(4, 54 - month.column)}`, ...(month.column >= 50 ? { justifySelf: "end" as const } : {}) }}>{month.label}</span>)}
          </div>
          <div className="ef-rec-grid" role="img" aria-label={`最近 53 周学习活动热力图，共 ${summary.windowActivities} 次活动`}>
            {summary.days.map((day) => {
              const level = activityLevel(day.count);
              const label = `${formatRecordFullDate(day.date)} · ${day.count} 次活动`;
              return <span
                key={day.date}
                className="ef-rec-cell"
                data-level={level}
                title={label}
                aria-hidden="true"
                onMouseEnter={(event) => showTip(event, day)}
                onMouseLeave={() => setTip(null)}
              />;
            })}
          </div>
        </div>
      </div>
    </div>
    {tip ? createPortal(<div className="ef-rec-cell-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>{tip.text}</div>, document.body) : null}
  </article>;
}

function TimelineCard({ data, groups, today, expandedId, onToggle, loadingMore, moreError, onLoadMore, filtering, onReset, returnTo }: {
  data: RecordsResponse;
  groups: ReturnType<typeof groupRecordEventsByDay>;
  today: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  loadingMore: boolean;
  moreError: string;
  onLoadMore: () => void;
  filtering: boolean;
  onReset: () => void;
  returnTo?: string | null;
}) {
  return <section className="ef-rec-timeline" aria-labelledby="ef-rec-timeline-title">
    <div className="ef-rec-timeline-head">
      <h2 id="ef-rec-timeline-title">时间线</h2>
      <span>{data.resultTotal} 条 · 按日期倒序</span>
    </div>
    {!data.events.length
      ? <div className="ef-rec-state">
          <History size={30} aria-hidden="true" />
          <h2>{data.summary.totalActivities === 0 ? "还没有学习记录" : "没有匹配的记录"}</h2>
          <p>{data.summary.totalActivities === 0 ? "完成一次小练习、提交动手任务或调整个人路线后，记录会出现在这里。" : "换一个类型、课程或时间范围试试。"}</p>
          <div className="ef-rec-state-actions">
            {filtering
              ? <Button variant="secondary" onClick={onReset}>清除筛选</Button>
              : <>
                  <Link className="ef-ui-btn ef-ui-btn--secondary" to="/archive">去我的地图看看</Link>
                  <Link className="ef-ui-btn ef-ui-btn--primary" to={returnTo ?? "/"}>{returnTo ? "返回对话" : "回首页开始学习"}</Link>
                </>}
          </div>
        </div>
      : <div className="ef-rec-days-list">
          {groups.map((group) => <section className="ef-rec-day" key={group.date} aria-label={formatRecordDayHeading(group.date)}>
            <div className="ef-rec-day-head">
              <b>{formatRecordDayHeading(group.date)}</b>
              {group.date === today ? <span className="ef-rec-today">今天</span> : null}
              <span className="ef-rec-day-count">{group.count} 条</span>
            </div>
            <div className="ef-rec-day-body">
              {group.events.map((event) => <EventRow key={event.id} event={event} timeZone={data.filters.timeZone} expanded={expandedId === event.id} onToggle={() => onToggle(event.id)} />)}
            </div>
          </section>)}
        </div>}
    {data.events.length ? <div className="ef-rec-more">
      {moreError ? <p className="ef-rec-more-error" role="alert">{moreError}</p> : null}
      {data.hasMore ? <Button variant="secondary" size="32" loading={loadingMore} onClick={onLoadMore}>加载更早的记录</Button> : <p className="ef-rec-more-end">已经到最早一条记录</p>}
    </div> : null}
  </section>;
}

function EventRow({ event, timeZone, expanded, onToggle }: {
  event: RecordEvent;
  timeZone: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = recordMetaParts(event);
  const isEvaluation = event.type === "evaluation";
  const primary = event.links[0];
  const expandId = `ef-rec-expand-${event.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return <div className="ef-rec-event-block">
    <div className={`ef-rec-event ef-rec-event--${event.type}`}>
      <time dateTime={event.occurredAt}>{formatTimeInTimeZone(event.occurredAt, timeZone)}</time>
      <span className={`ef-rec-icon ef-rec-icon--${event.type}`} aria-hidden="true">{eventIcon(event.type)}</span>
      <div className="ef-rec-event-main">
        <div className="ef-rec-event-top">
          <b>{RECORD_TYPE_LABELS[event.type]} ·<span>{event.title}</span></b>
          <Pill tone={recordStatusTone(event)}>{recordStatusLabel(event)}</Pill>
        </div>
        {meta.length ? <p className="ef-rec-event-meta">{meta.join(" · ")}</p> : null}
      </div>
      {isEvaluation
        ? <button type="button" className="ef-rec-view" aria-expanded={expanded} aria-controls={expandId} onClick={onToggle}>查看</button>
        : primary
          ? <Link className="ef-rec-view" to={primary.to}>查看</Link>
          : <span className="ef-rec-view ef-rec-view--disabled" aria-disabled="true">查看</span>}
    </div>
    {isEvaluation && expanded ? <div className="ef-rec-expand" id={expandId}>
      {event.feedback?.summary ? <p className="ef-rec-feedback-summary">{event.feedback.summary}</p> : null}
      {event.feedback?.comment ? <p>{event.feedback.comment}</p> : null}
      {event.feedback?.items.length ? <ul className="ef-rec-feedback-items">
        {event.feedback.items.map((item, index) => <li key={`${item.label}:${index}`}><span>{item.label}</span>{item.value ? <b>{item.value}</b> : null}</li>)}
      </ul> : null}
      {!event.feedback?.summary && !event.feedback?.comment && !event.feedback?.items.length ? <p>本次评价没有附带文字依据，可打开动手任务查看完整结果。</p> : null}
      {event.links.length ? <div className="ef-rec-expand-actions">
        {event.links.map((link) => <Link key={`${link.kind}:${link.to}`} to={link.to}>
          {isEvaluation && link.kind === "practice" ? "查看评价" : link.label}
          <ChevronRight size={12} aria-hidden="true" />
        </Link>)}
      </div> : null}
    </div> : null}
  </div>;
}

function eventIcon(type: RecordEventType) {
  if (type === "micro") return <BookOpen size={14} aria-hidden="true" />;
  if (type === "practice") return <FileText size={14} aria-hidden="true" />;
  if (type === "evaluation") return <Sparkles size={14} aria-hidden="true" />;
  return <Route size={14} aria-hidden="true" />;
}

function FilterCard({ data, types, range, courseId, loading, resetDisabled, onToggleType, onClearTypes, onCourse, onRange, onReset }: {
  data: RecordsResponse | null;
  types: RecordEventType[];
  range: RecordRange;
  courseId: string | null;
  loading: boolean;
  resetDisabled: boolean;
  onToggleType: (type: RecordEventType) => void;
  onClearTypes: () => void;
  onCourse: (value: string) => void;
  onRange: (value: RecordRange) => void;
  onReset: () => void;
}) {
  const counts = data?.counts;
  return <div className="ef-rec-filter ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-24" aria-label="记录筛选" aria-busy={loading || undefined}>
    <div className="ef-rec-filter-head">
      <b>筛选</b>
      <button type="button" className="ef-rec-reset" onClick={onReset} disabled={resetDisabled}>重置</button>
    </div>
    <div className="ef-rec-fgroup">
      <b>类型</b>
      <button type="button" className="ef-rec-frow" aria-pressed={types.length === 0} onClick={onClearTypes}>
        <span className="ef-rec-fcheck">{types.length === 0 ? <Check size={11} aria-hidden="true" /> : null}</span>
        <span>全部</span>
        <span className="ef-rec-fcount">{counts?.total ?? 0}</span>
      </button>
      {RECORD_EVENT_TYPES.map((type) => <button key={type} type="button" className="ef-rec-frow" aria-pressed={types.includes(type)} onClick={() => onToggleType(type)}>
        <span className="ef-rec-fcheck">{types.includes(type) ? <Check size={11} aria-hidden="true" /> : null}</span>
        <span>{RECORD_TYPE_LABELS[type]}</span>
        <span className="ef-rec-fcount">{counts?.byType[type] ?? 0}</span>
      </button>)}
    </div>
    <div className="ef-rec-fgroup">
      <b>课程</b>
      <label className="ef-rec-select">
        <span className="ef-rec-visually-hidden">课程筛选</span>
        <select value={courseId ?? ""} onChange={(event) => onCourse(event.target.value)}>
          <option value="">全部课程</option>
          {(data?.courses ?? []).map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </label>
    </div>
    <div className="ef-rec-fgroup">
      <b>时间</b>
      <div className="ef-rec-chips">
        {(Object.keys(RANGE_LABELS) as RecordRange[]).map((value) => <button key={value} type="button" className="ef-rec-chip" aria-pressed={range === value} onClick={() => onRange(value)}>{RANGE_LABELS[value]}</button>)}
      </div>
    </div>
    <div className="ef-rec-scope">
      <span>当前筛选 <b>{data?.resultTotal ?? 0}</b> 条记录</span>
      <span title={data?.scope.from && data.scope.to ? `${data.scope.from} – ${data.scope.to}` : undefined}>{formatRecordDateRange(data?.scope.from ?? null, data?.scope.to ?? null)}</span>
    </div>
  </div>;
}
