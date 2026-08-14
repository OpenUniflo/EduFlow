import { readLlmEnvironment, type LlmEnvironment } from "./env.js";
import type { StructuredGenerationClient, StructuredGenerationRequest, StructuredGenerationResult } from "../../src/features/knowledge/generation/types.js";

type DeepSeekResponse = {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

export class OpenAICompatibleJsonGenerationClient implements StructuredGenerationClient {
  constructor(private readonly config: LlmEnvironment, private readonly request: typeof fetch = fetch, private readonly timeoutMs = 60_000) {}

  async generateJson(input: StructuredGenerationRequest): Promise<StructuredGenerationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.request(`${this.config.llmBaseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.llmApiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.llmModel,
          thinking: { type: "disabled" },
          messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
          response_format: { type: "json_object" }, max_tokens: input.maxTokens,
          temperature: input.temperature, stream: false
        })
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`LLM request timed out: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
      void error;
      throw new Error(`LLM request failed: provider=${this.config.llmProvider}, model=${this.config.llmModel}, network error`);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`LLM request failed: provider=${this.config.llmProvider}, model=${this.config.llmModel}, HTTP ${response.status}`);
    let payload: DeepSeekResponse;
    try {
      payload = await response.json() as DeepSeekResponse;
    } catch {
      throw new Error(`LLM response was not valid JSON: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
    }
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error(`LLM response was truncated: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
    if (choice?.finish_reason !== "stop") throw new Error(`LLM response did not complete: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
    const content = choice.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error(`LLM response was empty: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error(`LLM content was not valid JSON: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
    }
    return { value, metadata: {
      stage: input.stage, provider: this.config.llmProvider,
      model: typeof payload.model === "string" ? payload.model : this.config.llmModel,
      promptVersion: input.promptVersion, schemaVersion: input.schemaVersion,
      requestId: typeof payload.id === "string" ? payload.id : "unreported", generatedAt: new Date().toISOString(),
      temperature: input.temperature, maxTokens: input.maxTokens,
      ...(typeof payload.usage?.prompt_tokens === "number" ? { promptTokens: payload.usage.prompt_tokens } : {}),
      ...(typeof payload.usage?.completion_tokens === "number" ? { completionTokens: payload.usage.completion_tokens } : {})
    } };
  }
}

export function createJsonGenerationClient(env: LlmEnvironment = readLlmEnvironment()) {
  return new OpenAICompatibleJsonGenerationClient(env);
}
