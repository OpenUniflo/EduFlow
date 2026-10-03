import { Check, Circle, Lock, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import { pathX, type CourseNavigatorModel } from './courseNavigatorProjection';

export function CoursePathView({ model, targetOutcome, onInspectCapabilities, onSelect }: { model: CourseNavigatorModel; targetOutcome?: string; onInspectCapabilities?(nodeId?: string): void; onSelect(nodeId: string): void }) {
  const reduced = useReducedMotion();
  let offset = 0;
  return <section className="navigator-path" aria-label="学习路线">
    <header className="navigator-path-heading"><span className="atlas-kicker">{targetOutcome ? '项目目标与个人能力路径' : '你的学习路线'}</span><h2>{targetOutcome ? '从已有能力，走向项目目标' : '一步一步，走向理解'}</h2><p>{targetOutcome ?? '沿着路线前进，已学内容与待完成实训会为你保留。'}</p><p>当前路线 · 已具备 {model.route.filter(item => item.state === 'completed').length} 项 · 待补 {model.route.filter(item => item.state !== 'completed').length} 项。已有能力变化后，路线会重新计算。</p>{model.recentKnowledgeUpdates.length ? <p className="navigator-recent-state">最近能力状态记录 · {model.recentKnowledgeUpdates.map(item => item.title).join('、')}：已具备。路线已按当前状态计算。</p> : null}{onInspectCapabilities ? <button className="navigator-locate" onClick={() => onInspectCapabilities()}>查看项目能力与缺口 →</button> : null}{model.route.some(item => item.state === 'current') ? <button className="navigator-locate" onClick={() => document.querySelector('.navigator-stop.current')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' })}>定位当前步骤 ↓</button> : null}</header>
    {!model.route.length ? <p role="status">当前路线没有待达成项目目标。</p> : null}
    {model.sections.map((section, sectionIndex) => {
      const start = offset; offset += section.items.length;
      return <section className="navigator-chapter" key={`${section.id}-${sectionIndex}`}>
        <header><small>{section.bridge ? '课程外能力' : '课程篇章'}</small><h3>{section.title}</h3></header>
        <ol className="navigator-track">
          {section.items.map((item, index) => {
            const x = pathX(start + index); const nextX = pathX(start + index + 1);
            const label = item.state === 'completed' ? item.mastered ? '已掌握' : '已学完' : item.state === 'current' ? model.nextAction ? '推荐下一步' : '下一步能力 · 内容待准备' : item.state === 'locked' ? '前置未满足' : '前置已满足';
            return <motion.li layout={!reduced} initial={false} transition={{ duration: reduced ? 0 : .24 }} className={`navigator-stop ${item.state}`} key={item.node.id} style={{ '--path-x': `${x}%` } as CSSProperties}>
              {index < section.items.length - 1 ? <svg className="navigator-connector" viewBox="0 0 100 180" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${x} 36 C ${x} 125, ${nextX} 125, ${nextX} 216`} vectorEffect="non-scaling-stroke" /></svg> : null}
              <button className="navigator-node" type="button" aria-current={item.state === 'current' ? 'step' : undefined} aria-label={`${item.node.title}，${item.state === 'locked' ? '尚未解锁，可查看详情' : label}`} onClick={() => onSelect(item.node.id)} title={item.blockedBy.length ? `先完成：${item.blockedBy.join('、')}` : item.node.title}>
                <motion.span key={item.state} initial={reduced ? false : { opacity: .5, scale: .9 }} animate={{ opacity: 1, scale: 1 }}>
                  {item.state === 'completed' ? <Check size={25} /> : item.state === 'locked' ? <Lock size={21} /> : item.state === 'current' ? <Play size={24} /> : <Circle size={21} />}
                </motion.span>
              </button>
              <div className="navigator-node-copy"><small>{label}</small><strong>{item.node.title}</strong></div>
            </motion.li>;
          })}
        </ol>
      </section>;
    })}
    {model.complete ? <p className="navigator-finish">✓ 教学路线已学完 · 实训进度单独保留</p> : null}
  </section>;
}
