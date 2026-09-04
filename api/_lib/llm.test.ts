import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleJsonGenerationClient } from "./llm";

const config = { llmProvider: "deepseek" as const, llmBaseUrl: "https://api.deepseek.com", llmApiKey: "server-only-key", llmModel: "deepseek-v4-flash" };
const input = { stage: "extraction" as const, promptVersion: "p1", schemaVersion: "s1", system: "Return JSON", user: "DATA", maxTokens: 100, temperature: 0.1 };

function response(content: unknown, finishReason = "stop") {
  return new Response(JSON.stringify({ id: "req-1", model: "deepseek-v4-flash", choices: [{ finish_reason: finishReason, message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }), { status: 200 });
}

describe("DeepSeek JSON generation adapter", () => {
  it("requests JSON mode and returns parsed output with reproducibility metadata", async () => {
    const request = vi.fn<typeof fetch>(async () => response('{"candidates":[]}'));
    const result = await new OpenAICompatibleJsonGenerationClient(config, request).generateJson(input);
    expect(result.value).toEqual({ candidates: [] });
    expect(result.metadata).toMatchObject({ provider: "deepseek", model: "deepseek-v4-flash", requestId: "req-1", promptVersion: "p1", schemaVersion: "s1", promptTokens: 10, completionTokens: 20 });
    const [, init] = request.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ thinking: { type: "disabled" }, response_format: { type: "json_object" }, stream: false, max_tokens: 100, temperature: 0.1 });
  });

  it.each([
    ["empty response", response("")],
    ["invalid JSON", response("not-json")],
    ["truncated response", response("{}", "length")],
    ["invalid envelope", response("{}", "content_filter")]
  ])("rejects %s", async (_label, upstream) => {
    await expect(new OpenAICompatibleJsonGenerationClient(config, async () => upstream).generateJson(input)).rejects.toThrow();
  });

  it("rejects provider failures without leaking the key or upstream body", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(`secret ${config.llmApiKey}`, { status: 401 }));
    const client = new OpenAICompatibleJsonGenerationClient(config, request);
    const error = await client.generateJson(input).then(() => new Error("expected failure"), (caught: unknown) => caught as Error);
    expect(error.message).toBe("LLM request failed: provider=deepseek, model=deepseek-v4-flash, HTTP 401");
    expect(error.message).not.toContain(config.llmApiKey);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries a transient network failure and succeeds", async () => {
    const request = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(response('{"candidates":[]}'));
    await expect(new OpenAICompatibleJsonGenerationClient(config, request).generateJson(input)).resolves.toMatchObject({ value: { candidates: [] } });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("retries a transient provider failure and succeeds", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(response('{"candidates":[]}'));
    await expect(new OpenAICompatibleJsonGenerationClient(config, request).generateJson(input)).resolves.toMatchObject({ value: { candidates: [] } });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects network failures and timeout", async () => {
    await expect(new OpenAICompatibleJsonGenerationClient(config, async () => { throw new Error("network"); }).generateJson(input)).rejects.toThrow(/network error/);
    const hangingFetch = ((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
    await expect(new OpenAICompatibleJsonGenerationClient(config, hangingFetch, 1).generateJson(input)).rejects.toThrow(/timed out/);
  });
});
