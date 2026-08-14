import { describe, expect, it } from "vitest";
import { readEmbeddingEnvironment, readLlmEnvironment, readServerEnvironment } from "./env";

describe("server environment", () => {
  it("requires server and publishable Supabase configuration", () => {
    expect(readServerEnvironment({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "server-only",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable"
    })).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseSecretKey: "server-only",
      supabasePublishableKey: "publishable"
    });
  });

  it("validates the fixed embedding contract", () => {
    expect(readEmbeddingEnvironment({
      EMBEDDING_PROVIDER: "dmxapi",
      EMBEDDING_BASE_URL: "https://www.dmxapi.cn/v1/",
      EMBEDDING_API_KEY: "embedding-server-only",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1024"
    })).toEqual({
      embeddingProvider: "dmxapi",
      embeddingBaseUrl: "https://www.dmxapi.cn/v1",
      embeddingApiKey: "embedding-server-only",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1024
    });
  });

  it("does not accept an absent server secret", () => {
    expect(() => readServerEnvironment({ SUPABASE_URL: "url", VITE_SUPABASE_PUBLISHABLE_KEY: "public" })).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("validates the existing server-only DeepSeek variable contract", () => {
    expect(readLlmEnvironment({
      LLM_PROVIDER: "deepseek", LLM_BASE_URL: "https://api.deepseek.com/", LLM_API_KEY: "server-only", LLM_MODEL: "deepseek-v4-flash"
    })).toEqual({ llmProvider: "deepseek", llmBaseUrl: "https://api.deepseek.com", llmApiKey: "server-only", llmModel: "deepseek-v4-flash" });
    expect(() => readLlmEnvironment({ LLM_PROVIDER: "other", LLM_BASE_URL: "https://api.deepseek.com", LLM_API_KEY: "x", LLM_MODEL: "model" })).toThrow(/LLM_PROVIDER/);
    expect(() => readLlmEnvironment({ LLM_PROVIDER: "deepseek", LLM_BASE_URL: "not-a-url", LLM_API_KEY: "x", LLM_MODEL: "model" })).toThrow(/LLM_BASE_URL/);
  });

  it.each(["0", "-1", "1.5", "768", "not-a-number"])("rejects invalid embedding dimensions: %s", (dimensions) => {
    expect(() => readEmbeddingEnvironment({
      EMBEDDING_PROVIDER: "dmxapi",
      EMBEDDING_BASE_URL: "https://www.dmxapi.cn/v1",
      EMBEDDING_API_KEY: "embedding-server-only",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: dimensions
    })).toThrow(/EMBEDDING_DIMENSIONS/);
  });

  it("rejects unsupported provider and model values", () => {
    expect(() => readEmbeddingEnvironment({
      EMBEDDING_PROVIDER: "openai",
      EMBEDDING_BASE_URL: "https://www.dmxapi.cn/v1",
      EMBEDDING_API_KEY: "embedding-server-only",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1024"
    })).toThrow(/EMBEDDING_PROVIDER must be dmxapi/);
    expect(() => readEmbeddingEnvironment({
      EMBEDDING_PROVIDER: "dmxapi",
      EMBEDDING_BASE_URL: "https://www.dmxapi.cn/v1",
      EMBEDDING_API_KEY: "embedding-server-only",
      EMBEDDING_MODEL: "other-model",
      EMBEDDING_DIMENSIONS: "1024"
    })).toThrow(/EMBEDDING_MODEL must be text-embedding-3-small/);
  });

  it.each([undefined, "", "not-a-url", "ftp://example.com/v1"])("rejects an invalid embedding base URL: %s", (baseUrl) => {
    expect(() => readEmbeddingEnvironment({
      EMBEDDING_PROVIDER: "dmxapi",
      EMBEDDING_BASE_URL: baseUrl,
      EMBEDDING_API_KEY: "embedding-server-only",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1024"
    })).toThrow(/EMBEDDING_BASE_URL/);
  });

  it("requires the server-only embedding API key", () => {
    expect(() => readEmbeddingEnvironment({
      EMBEDDING_PROVIDER: "dmxapi",
      EMBEDDING_BASE_URL: "https://www.dmxapi.cn/v1",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1024"
    })).toThrow(/EMBEDDING_API_KEY/);
  });
});
