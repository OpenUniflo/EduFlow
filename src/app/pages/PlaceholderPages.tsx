import { BookOpen, Clock3, FileText, Home } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/Button";

export function RecordsPage() {
  return <ComingSoonPage kicker="学习记录" title="记录" description="热力图、时间线与学习证据会在这里汇总。" icon={<Clock3 size={22} aria-hidden />} />;
}

export function SettingsPage() {
  return <ComingSoonPage kicker="设置" title="设置" description="外观、通知与学习偏好会在这里集中管理。" icon={<FileText size={22} aria-hidden />} />;
}

export function ComingSoonPage({ kicker, title, description, icon }: { kicker: string; title: string; description: string; icon: ReactNode }) {
  return (
    <main className="ef-doc-page">
      <header className="ef-doc-head">
        <span className="ef-doc-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <section className="ef-empty" aria-labelledby="ef-coming-soon">
        {icon}
        <h2 id="ef-coming-soon">即将推出</h2>
        <p>这一页还没有接入真实数据，等后续版本完成后再开放。</p>
      </section>
    </main>
  );
}

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
