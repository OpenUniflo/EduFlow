import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MicroBody } from "@/features/learning/micro/MicroBody";

describe("Micro math content",()=>{
  it("renders inline and block math alongside Chinese text",()=>{
    const html=renderToStaticMarkup(<MicroBody body={String.raw`参数 \(\theta\)，学习率 \(\eta\)，梯度 \(\nabla C\)，\(\mathrm{Loss}\)。\[\theta_{t+1}=\theta_t-\eta\nabla C(\theta_t)\]`}/>);
    expect(html).toContain("micro-math-inline");expect(html).toContain("katex-display");expect(html).toContain("参数");expect(html).toContain("<math");
  });
  it("keeps legacy text and unmatched delimiters readable",()=>{
    const html=renderToStaticMarkup(<MicroBody body={"旧公式 θ=4\n未闭合 \\(eta"}/>);
    expect(html).toContain("旧公式 θ=4");expect(html).not.toContain("katex");
  });
  it("falls back safely for unsupported math, raw HTML, and unknown content",()=>{
    const html=renderToStaticMarkup(<MicroBody body={String.raw`<script>bad()</script> \(\unsupportedcommand{x}\)`}/>);
    expect(html).toContain("micro-math-fallback");expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");
    expect(renderToStaticMarkup(<MicroBody body={{html:"bad"}}/>)).toContain("内容暂不支持显示");
  });
  it("does not enable untrusted HTML or URL commands",()=>{
    const html=renderToStaticMarkup(<MicroBody body={String.raw`\(\href{javascript:alert(1)}{click}\) \(\htmlClass{evil}{x}\)`}/>);
    expect(html).not.toContain('href="javascript:');expect(html).not.toContain('class="evil"');
  });
});
