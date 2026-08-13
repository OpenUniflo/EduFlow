import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleEmbeddingService } from "./embedding";

const config = {
  embeddingProvider: "dmxapi" as const,
  embeddingBaseUrl: "https://www.dmxapi.cn/v1",
  embeddingApiKey: "server-only-test-key",
  embeddingModel: "text-embedding-3-small" as const,
  embeddingDimensions: 1024
};

function embeddingResponse(embedding: unknown): Response {
  return new Response(JSON.stringify({ data: [{ embedding }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("OpenAICompatibleEmbeddingService", () => {
  it("uses the configured endpoint, authorization, and explicit 1024-dimensional payload", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => embeddingResponse(
      Array.from({ length: 1024 }, (_, index) => index / 1024)
    ));
    const service = new OpenAICompatibleEmbeddingService(config, request);

    await expect(service.embed("Tool Calling")).resolves.toHaveLength(1024);
    const [input, init] = request.mock.calls[0];
    expect(input).toBe("https://www.dmxapi.cn/v1/embeddings");
    expect(init?.headers).toEqual({
      Authorization: "Bearer server-only-test-key",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      input: "Tool Calling",
      model: "text-embedding-3-small",
      dimensions: 1024,
      encoding_format: "float"
    });
  });

  it("rejects a 1536-dimensional response instead of truncating it", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => embeddingResponse(
      Array.from({ length: 1536 }, () => 0.1)
    ));
    const service = new OpenAICompatibleEmbeddingService(config, request);

    await expect(service.embed("Tool Calling")).rejects.toThrow(
      /dimension mismatch: provider=dmxapi, model=text-embedding-3-small, actual=1536, configured=1024/
    );
  });

  it.each([
    { label: "empty", embedding: [] },
    { label: "NaN", embedding: [Number.NaN] },
    { label: "Infinity", embedding: [Number.POSITIVE_INFINITY] }
  ])("rejects a $label vector", async ({ embedding }) => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => embeddingResponse(embedding));
    const service = new OpenAICompatibleEmbeddingService(config, request);

    await expect(service.embed("Tool Calling")).rejects.toThrow(/schema mismatch.*non-empty finite numeric vector/);
  });

  it("does not include the upstream body or API key in HTTP errors", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      "sensitive upstream details server-only-test-key",
      { status: 401 }
    ));
    const service = new OpenAICompatibleEmbeddingService(config, request);

    const error = await service.embed("Tool Calling").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Embedding request failed: provider=dmxapi, model=text-embedding-3-small, HTTP 401"
    );
    expect((error as Error).message).not.toContain("sensitive upstream details");
    expect((error as Error).message).not.toContain(config.embeddingApiKey);
  });

  it("does not leak a malformed successful response body", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      "sensitive malformed payload server-only-test-key",
      { status: 200 }
    ));
    const service = new OpenAICompatibleEmbeddingService(config, request);

    const error = await service.embed("Tool Calling").catch((caught: unknown) => caught);
    expect((error as Error).message).toBe(
      "Embedding schema mismatch: provider=dmxapi, model=text-embedding-3-small, response was not valid JSON"
    );
    expect((error as Error).message).not.toContain("sensitive malformed payload");
    expect((error as Error).message).not.toContain(config.embeddingApiKey);
  });
});
