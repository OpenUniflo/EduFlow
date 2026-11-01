import { useEffect } from "react";
import { BookOpen, Home, Search } from "lucide-react";
import { Button, openCommandPalette } from "@/shared/ui";
import "./notFound.css";

/** N50. The same app-owned ⌘K surface serves signed-in and anonymous viewers. */
export function NotFoundPage({ onHome, onArchive }: { onHome: () => void; onArchive: () => void }) {
  useEffect(() => {
    document.body.dataset.page = "not-found";
    return () => { delete document.body.dataset.page; };
  }, []);

  return (
    <main className="ef-nf">
      <span className="ef-nf-code">404</span>
      <h1>找不到这个页面</h1>
      <p>链接可能已经失效，或者这门课程还没有对你公开。</p>
      <div className="ef-nf-actions">
        <Button variant="primary" icon={<Home size={16} aria-hidden />} onClick={onHome}>回到首页</Button>
        <Button variant="secondary" icon={<BookOpen size={16} aria-hidden />} onClick={onArchive}>打开档案</Button>
      </div>
      <button
        type="button"
        className="ef-nf-search ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-full"
        onClick={() => openCommandPalette({ source: "404" })}
        aria-label="打开全局搜索：搜索课程、知识或页面"
      >
        <Search size={18} aria-hidden />
        <span>搜索课程、知识或页面</span>
        <kbd>⌘K</kbd>
      </button>
    </main>
  );
}
