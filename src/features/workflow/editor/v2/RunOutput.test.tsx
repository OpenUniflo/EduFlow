import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readableAnswer, ReadableRunOutput, ToolStepOutput } from "./RunOutput";

it("shows actual tool values and correlates their source by call identity without executing HTML", () => {
  const html = renderToStaticMarkup(<ToolStepOutput step={{stepId:"s",runId:"r",nodeId:"n",invocation:1,attempt:1,status:"completed",input:{toolCalls:[{id:"c",name:"registered_tool"}]},output:{toolMessages:[{id:"m",toolCallId:"c",content:[{type:"text",text:JSON.stringify({total:128,currency:"CNY",note:"<script>alert(1)</script>"})}]}]}}}/>);
  expect(html).toContain("registered_tool"); expect(html).toContain("128"); expect(html).toContain("CNY"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
});
it("shows the latest assistant reply directly while retaining safe rendering",()=>{
  const value={answer:{messages:[{role:"user",content:[{type:"text",text:"question"}]},{role:"assistant",content:[{type:"text",text:"earlier"}]},{role:"assistant",content:[{type:"text",text:"<script>latest reply</script>"}]}]}};
  expect(readableAnswer(value)).toBe("<script>latest reply</script>");
  const html=renderToStaticMarkup(<ReadableRunOutput value={value} text=""/>);
  expect(html).toContain("&lt;script&gt;latest reply");expect(html).not.toContain("<script>");
  expect(readableAnswer({arbitrary:"raw data"})).toBeUndefined();
});
