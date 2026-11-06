import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Assistant Markdown. Raw HTML is never rendered: `skipHtml` drops HTML nodes
 * and there is no `rehype-raw`, so model output cannot inject markup.
 */
export function AssistantMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return <div className={`ef-assistant-md${streaming ? " is-streaming" : ""}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children, ...rest }) => <a {...rest} href={href} {...(href && !href.startsWith("/") ? { target: "_blank", rel: "noreferrer noopener" } : {})}>{children}</a>,
        table: ({ children, ...rest }) => <div className="ef-assistant-md-table"><table {...rest}>{children}</table></div>
      }}
    >{text}</ReactMarkdown>
  </div>;
}
