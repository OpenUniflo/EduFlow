import { readEmbeddingEnvironment, type EmbeddingEnvironment } from "./env.js";

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

export type OpenAICompatibleEmbeddingConfig = Pick<
  EmbeddingEnvironment,
  "embeddingProvider" | "embeddingBaseUrl" | "embeddingApiKey" | "embeddingModel" | "embeddingDimensions"
>;

type OpenAIEmbeddingResponse = {
  data?: Array<{ embedding?: unknown }>;
};

export class OpenAICompatibleEmbeddingService implements EmbeddingService {
  constructor(
    private readonly config: OpenAICompatibleEmbeddingConfig,
    private readonly request: typeof fetch = fetch
  ) {}

  async embed(text: string): Promise<number[]> {
    if (!text.trim()) throw new Error("Embedding input must not be empty");

    const response = await this.requestWithTransientRetry({
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.embeddingApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: text,
        model: this.config.embeddingModel,
        dimensions: this.config.embeddingDimensions,
        encoding_format: "float"
      })
    });

    if (!response.ok) {
      throw new Error(
        `Embedding request failed: provider=${this.config.embeddingProvider}, model=${this.config.embeddingModel}, HTTP ${response.status}`
      );
    }

    let payload: OpenAIEmbeddingResponse;
    try {
      payload = await response.json() as OpenAIEmbeddingResponse;
    } catch {
      throw new Error(
        `Embedding schema mismatch: provider=${this.config.embeddingProvider}, model=${this.config.embeddingModel}, response was not valid JSON`
      );
    }
    const embedding = payload.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding)
      || embedding.length === 0
      || !embedding.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding schema mismatch: provider=${this.config.embeddingProvider}, model=${this.config.embeddingModel}, expected a non-empty finite numeric vector`
      );
    }
    if (embedding.length !== this.config.embeddingDimensions) {
      throw new Error(
        `Embedding dimension mismatch: provider=${this.config.embeddingProvider}, model=${this.config.embeddingModel}, actual=${embedding.length}, configured=${this.config.embeddingDimensions}`
      );
    }
    return embedding;
  }

  private async requestWithTransientRetry(init: RequestInit): Promise<Response> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.request(`${this.config.embeddingBaseUrl}/embeddings`, { ...init, signal: AbortSignal.timeout(30_000) });
        if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 3) return response;
        await response.body?.cancel();
      } catch (error) {
        if (attempt === 3) {
          const cause=error&&typeof error==='object'&&'cause' in error?error.cause:undefined;
          const code=cause&&typeof cause==='object'&&'code' in cause?String(cause.code):'';
          const diagnostic=/^[A-Z0-9_]{1,80}$/.test(code)?` (${code})`:'';
          throw new Error(`Embedding request failed: provider=${this.config.embeddingProvider}, model=${this.config.embeddingModel}, network error${diagnostic}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 150 * attempt));
    }
    throw new Error('Embedding request failed after bounded retries');
  }
}

export function createEmbeddingService(env: EmbeddingEnvironment = readEmbeddingEnvironment()): EmbeddingService {
  return new OpenAICompatibleEmbeddingService(env);
}
