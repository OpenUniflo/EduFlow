import katex from "katex";
import "katex/dist/katex.min.css";

/** Text remains text. Only explicit TeX delimiters opt into mathematical typesetting. */
export function MicroMath({tex, block = false}: {tex: string; block?: boolean}) {
  try {
    const html = katex.renderToString(tex, {displayMode: block, throwOnError: true, trust: false, strict: "error", maxExpand: 200, maxSize: 10, macros: {}});
    return <span className={block ? "micro-math-block" : "micro-math-inline"} dangerouslySetInnerHTML={{__html: html}}/>;
  } catch {
    return <span className={block ? "micro-math-block micro-math-fallback" : "micro-math-fallback"}>{tex}</span>;
  }
}
export function MicroBody({body}: {body: unknown}) {
  if (typeof body !== "string") return <div className="micro-body">内容暂不支持显示。</div>;
  const parts = body.split(/(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);
  return <div className="micro-body">{parts.map((part, index) => part.startsWith("\\[") && part.endsWith("\\]") ? <MicroMath key={index} tex={part.slice(2,-2)} block/> : part.startsWith("\\(") && part.endsWith("\\)") ? <MicroMath key={index} tex={part.slice(2,-2)}/> : <span key={index}>{part}</span>)}</div>;
}
