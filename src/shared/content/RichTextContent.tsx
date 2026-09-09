import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { renderToReactElement } from "@tiptap/static-renderer";
import { decodeLearningContent } from "./richText";
import { ContentText, PlainContent } from "./ContentMath";
import "./richText.css";

const extensions = [StarterKit.configure({ heading: { levels: [2, 3, 4] }, undoRedo: false, dropcursor: false, gapcursor: false, trailingNode: false }), TextStyleKit.configure({ lineHeight: false }), TextAlign.configure({ types: ["paragraph", "heading"] }), Highlight.configure({ multicolor: true })];
const schema = getSchema(extensions);

export function RichTextContent({ body }: { body: unknown }) {
  const content = decodeLearningContent(body);
  if (typeof content === "string") return <PlainContent body={content}/>;
  if (content) {
    try {
      const document = schema.nodeFromJSON(content);
      document.check();
      return <div className="micro-body rich-content">{renderToReactElement({ extensions, content: document, options: {
        nodeMapping: { text: ({ node, parent }) => parent?.type.name === "codeBlock" || node.marks.some(mark => mark.type.name === "code") ? node.text : <ContentText body={node.text}/> },
        markMapping: { link: ({ mark, children }) => <a href={mark.attrs.href} target={mark.attrs.target ?? "_blank"} rel="noopener noreferrer">{children}</a> },
      } })}</div>;
    } catch { /* Malformed/unsupported documents never become raw HTML. */ }
  }
  return <div className="micro-body">内容暂不支持显示。</div>;
}
