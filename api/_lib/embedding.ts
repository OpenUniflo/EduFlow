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

    const response = await this.request(`${this.config.embeddingBaseUrl}/embeddings`, {
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
}

export function createEmbeddingService(env: EmbeddingEnvironment = readEmbeddingEnvironment()): EmbeddingService {
  return new OpenAICompatibleEmbeddingService(env);
}
