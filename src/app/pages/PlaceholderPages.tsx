import { BookOpen, Home } from "lucide-react";
import { Button } from "@/shared/ui/Button";

/** 404 (N50). The search affordance arrives with ⌘K in P7, so it is not faked here. */
export function NotFoundPage({ onHome, onArchive }: { onHome: () => void; onArchive: () => void }) {
  return (
    <main className="ef-notfound">
      <span className="ef-notfound-code">404</span>
      <h1>找不到这个页面</h1>
      <p>链接可能已经失效，或者这门课程还没有对你公开。</p>
      <div className="ef-notfound-actions">
        <Button variant="primary" icon={<Home size={16} aria-hidden />} onClick={onHome}>回到首页</Button>
        <Button variant="secondary" icon={<BookOpen size={16} aria-hidden />} onClick={onArchive}>打开档案</Button>
      </div>
    </main>
  );
}
