import katex from "katex";
import "katex/dist/katex.min.css";

/** Text remains text. Only explicit TeX delimiters opt into mathematical typesetting. */
export function ContentMath({tex, block = false}: {tex: string; block?: boolean}) {
  try {
    const html = katex.renderToString(tex, {displayMode: block, throwOnError: true, trust: false, strict: "error", maxExpand: 200, maxSize: 10, macros: {}});
    return <span className={block ? "micro-math-block" : "micro-math-inline"} dangerouslySetInnerHTML={{__html: html}}/>;
  } catch {
    return <span className={block ? "micro-math-block micro-math-fallback" : "micro-math-fallback"}>{tex}</span>;
  }
}
export function ContentText({body}: {body: unknown}) {
  if (typeof body !== "string") return <>内容暂不支持显示。</>;
  const parts = body.split(/(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);
  return <>{parts.map((part, index) => part.startsWith("\\[") && part.endsWith("\\]") ? <ContentMath key={index} tex={part.slice(2,-2)} block/> : part.startsWith("\\(") && part.endsWith("\\)") ? <ContentMath key={index} tex={part.slice(2,-2)}/> : <span key={index}>{part}</span>)}</>;
}

export function PlainContent({body}: {body: unknown}) { return <div className="micro-body"><ContentText body={body}/></div>; }
