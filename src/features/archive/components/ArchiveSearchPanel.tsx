import { ArrowRight, BookOpen, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FollowedPerson } from "@/features/profile/people/PeopleRepository";
import type { ArchiveSearchResults } from "../model/atlasModel";
import { Avatar } from "@/shared/ui/Avatar";
import { PreviewBadge } from "@/shared/ui/PreviewBadge";

function shortName(person: FollowedPerson) {
  return person.displayName.replace(/^示例\s*·\s*/, "");
}

export function ArchiveSearchPanel({ belowStrip, query, results, searching, onQueryChange, onClose, onSelectNode, onFocusCourse, onOpenCourse, onSelectPerson, onAskAssistant }: {
  belowStrip?: boolean;
  query: string;
  results: ArchiveSearchResults | null;
  searching: boolean;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onFocusCourse: (id: string) => void;
  onOpenCourse: (id: string) => void;
  onSelectPerson: (person: FollowedPerson) => void;
  onAskAssistant: (goal: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const noResult = Boolean(query.trim() && results?.empty && !searching);
  return (
    <section className={`ef-archive-search-panel ${belowStrip ? "is-below-strip" : ""}`} aria-label="档案搜索">
      <header className="ef-archive-search-head">
        <span className="ef-archive-panel-kicker"><Search size={14} aria-hidden />搜索</span>
        <span className="ef-archive-panel-meta">{results ? `${results.knowledge.total} 个知识 · ${results.courses.total} 门课程 · ${results.people.total} 位同学` : "课程与知识"}</span>
        <button type="button" className="ef-archive-search-close" onClick={onClose} aria-label="关闭搜索"><X size={14} aria-hidden /></button>
      </header>
      <label className="ef-archive-search-field">
        <Search size={15} aria-hidden />
        <input ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索课程、知识或同学" aria-label="搜索课程、知识或同学" />
        {query ? <button type="button" onClick={() => onQueryChange("")} aria-label="清除搜索"><X size={13} aria-hidden /></button> : <kbd>⌘K</kbd>}
      </label>
      {!query.trim() ? <p className="ef-archive-search-hint">输入知识、课程或同学的名字。搜索只改变镜头与高亮，不移动节点。</p> : null}
      {noResult ? (
        <div className="ef-archive-no-result" role="status">
          <span className="ef-archive-no-result-icon"><Search size={18} aria-hidden /></span>
          <b>没有找到「{query.trim()}」</b>
          <p>课程库和知识图里都没有匹配项。换个更宽泛的词，或者直接用这个目标开一门个人课程。</p>
          <div className="ef-archive-suggestions" aria-label="更宽泛的说法">
            <span>换个说法</span>
            {["机器学习", "大模型", "Agent"].map((suggestion) => <button type="button" key={suggestion} onClick={() => onQueryChange(suggestion)}>{suggestion}</button>)}
          </div>
          <button type="button" className="ef-archive-ask-card" onClick={() => onAskAssistant(query.trim())}>
            <Sparkles size={15} aria-hidden />
            <span><b>用这个目标创建个人课程</b><small>「{query.trim()}」· 让助手整理需求，进入课程创建</small></span>
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      ) : null}
      {results && !noResult ? (
        <div className="ef-archive-search-results">
          {results.knowledge.items.length ? (
            <section className="ef-archive-result-group" aria-label="知识">
              <div className="ef-archive-result-head"><b>知识</b><span>{results.knowledge.total} 个命中</span></div>
              {results.knowledge.items.slice(0, 3).map(({ node, hitIndex }) => (
                <button type="button" key={node.id} className="ef-archive-result-row" onClick={() => onSelectNode(node.id)}>
                  <span className="ef-archive-result-number">{String(hitIndex + 1).padStart(2, "0")}</span>
                  <span><b>{node.title}</b><small>{node.domainTitle} · {node.isMine ? (node.status === "learning" ? "在学" : node.status === "learned" ? "已学" : "我的知识") : "可探索"} · 命中 {node.courseContexts.length} 门课程</small></span>
                  <ArrowRight size={13} aria-hidden />
                </button>
              ))}
              {results.knowledge.total > 3 ? <p className="ef-archive-result-more">地图上还有 {Math.min(5, results.knowledge.total) - 3} 个命中知识</p> : null}
            </section>
          ) : null}
          {results.courses.items.length ? (
            <section className="ef-archive-result-group" aria-label="课程">
              <div className="ef-archive-result-head"><b>课程</b><span>{results.courses.total} 门</span></div>
              {results.courses.items.slice(0, 3).map(({ course, matchedKnowledgeIds }) => (
                <button type="button" key={course.id} className="ef-archive-result-row" onClick={() => onFocusCourse(course.id)}>
                  <span className="ef-archive-result-course"><BookOpen size={14} aria-hidden /></span>
                  <span><b title={course.title}>{course.title}</b><small>命中 {matchedKnowledgeIds.length} 个知识 · {course.knowledgeCount} 个知识 · {course.chapterCount} 章</small></span>
                  <em>{course.state === "active" ? `在学 ${course.progress}%` : course.state === "draft" ? "草稿" : "未加入"}</em>
                </button>
              ))}
            </section>
          ) : null}
          {results.people.items.length ? (
            <section className="ef-archive-result-group" aria-label="同学">
              <div className="ef-archive-result-head"><b>同学</b><span>{results.people.total} 位</span><PreviewBadge /></div>
              {results.people.items.slice(0, 2).map(({ person }) => (
                <button type="button" key={person.id} className="ef-archive-result-row" data-preview="sample" onClick={() => onSelectPerson(person)}>
                  <Avatar name={shortName(person)} size={28} personColor={person.accent} decorative />
                  <span><b>{person.displayName}</b><small>{person.visibility === "private" ? "未公开学习进度" : `公开 ${person.sharedKnowledgeIds?.length ?? person.sharedKnowledgeCount} 个知识`} · 示例档案</small></span>
                  <ArrowRight size={13} aria-hidden />
                </button>
              ))}
            </section>
          ) : null}
          <footer className="ef-archive-search-foot">
            <span>{searching ? "正在搜索…" : `${results.knowledge.total + results.courses.total + results.people.total} 个结果 · 坐标未改变`}</span>
            <button type="button" className="ef-archive-text-btn" onClick={() => onOpenCourse(results.courses.items[0]?.course.id ?? "")} disabled={!results.courses.items.length}>打开第一个课程</button>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
