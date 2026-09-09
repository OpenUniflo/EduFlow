import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichTextContent } from "@/shared/content/RichTextContent";
import { contentStyles, decodeLearningContent } from "@/shared/content/richText";

const render = (body: unknown) => renderToStaticMarkup(<RichTextContent body={body}/>);
const text = (value: string, marks?: unknown[]) => ({type:"text", text:value, ...(marks ? {marks} : {})});
const doc = (content: unknown[]) => ({type:"doc",content});
describe("shared Tiptap static content", () => {
  it("renders standard structure, semantic emphasis, links and code without an editor", () => {
    const html = render(doc([
      {type:"heading",attrs:{level:2,textAlign:"center"},content:[text("Information chain")]},
      {type:"paragraph",content:[text("Model",[{type:"bold"}]),text(" distinction",[{type:"italic"}]),text("tool_call_id",[{type:"code"}]),text("docs",[{type:"link",attrs:{href:"https://tiptap.dev",rel:"opener"}}])]},
      ...["bulletList","orderedList"].map(type => ({type,content:[{type:"listItem",content:[{type:"paragraph",content:[text("Observe then decide")]}]}]})),
      {type:"blockquote",content:[{type:"paragraph",content:[text("Completion is not mastery")]}]},
      {type:"codeBlock",attrs:{language:"json"},content:[text('{"role":"tool"}')]},
    ]));
    for(const fragment of ["<h2", "text-align:center", "<strong><span>Model", "<em>", "<code>", "<ul>", "<ol>", "<blockquote>", "<pre>", 'rel="noopener noreferrer"']) expect(html).toContain(fragment);
    expect(html).not.toContain("<p><div");
  });
  it("supports every controlled typography and color value", () => {
    for (const [key, values] of Object.entries(contentStyles)) for (const value of values) {
      const body=doc([{type:"paragraph",content:[text("Styled",[{type:"textStyle",attrs:{[key]:value}}])]}]);
      expect(decodeLearningContent(body)).not.toBeNull();
      expect(render(body)).toContain("Styled");
      expect(render(body)).toContain("style=");
    }
    expect(render(doc([{type:"paragraph",content:[text("Rule",[{type:"highlight",attrs:{color:"var(--amber)"}}])]}]))).toContain("<mark");
  });
  it("round trips serialized JSON and preserves legacy math including formulas in lists", () => {
    const body=doc([{type:"paragraph",content:[text(String.raw`参数 \(\theta\) 与 \[x^2\]`)]}]);
    expect(render(body)).toBe(render(JSON.stringify(body)));
    expect(render(body)).toContain("katex-display");
    expect(render(String.raw`旧内容 \(x\)`)).toContain("katex");
    const code=doc([{type:"codeBlock",content:[text(String.raw`\(x\)`)]}]);
    expect(render(code)).not.toContain("katex");
  });
  it("rejects unsafe styles, unsupported nodes and invalid ProseMirror structure", () => {
    for(const marks of [[{type:"textStyle",attrs:{fontSize:"500px"}}],[{type:"textStyle",attrs:{color:"#123456"}}],[{type:"link",attrs:{href:"javascript:alert(1)"}}]]) {
      expect(render(doc([{type:"paragraph",content:[text("Bad",marks)]}]))).toContain("内容暂不支持");
    }
    for(const content of [[{type:"image",attrs:{src:"x"}}],[text("invalid root")],[{type:"paragraph",content:[{type:"paragraph"}]}]]) expect(render(doc(content))).toContain("内容暂不支持");
    expect(render("<script>bad()</script>")).not.toContain("<script>");
    expect(render('{"a":1}')).toContain('&quot;a&quot;');
  });
});
