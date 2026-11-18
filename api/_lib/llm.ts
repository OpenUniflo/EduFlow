import { createHash, randomUUID } from "node:crypto";
import { readLlmEnvironment, type LlmEnvironment } from "./env.js";
import type { StructuredGenerationClient, StructuredGenerationRequest, StructuredGenerationResult } from "../../src/features/knowledge/generation/types.js";

/**
 * Provider-agnostic request identity for OpenAI-compatible endpoints.
 *
 * opencode-go requires a stable per-conversation session id and a client
 * User-Agent. The wire value is a truncated SHA-256 of the internal key so a
 * database or Attempt identity never leaves the server.
 */
export function llmRequestHeaders(sessionKey: string): Record<string, string> {
  const session = createHash("sha256").update(sessionKey).digest("hex").slice(0, 32);
  return {
    "x-opencode-session": session,
    "User-Agent": "eduflow/1.0"
  };
}

type DeepSeekResponse = {
  id?: unknown;
  model?: unknown;
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};

export class OpenAICompatibleJsonGenerationClient implements StructuredGenerationClient {
  private readonly sessionKey: string;
  constructor(private readonly config: LlmEnvironment, private readonly request: typeof fetch = fetch, private readonly timeoutMs = 60_000, sessionKey?: string) {
    // No stable generation identity exists on the request today; one client
    // instance keeps one stable session across its bounded retries.
    this.sessionKey = sessionKey ?? randomUUID();
  }

  async generateJson(input: StructuredGenerationRequest): Promise<StructuredGenerationResult> {
    const response = await this.requestWithTransientRetry(input);
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
      temperature: input.temperature, maxTokens: input.maxTokens, thinking: input.thinking ?? false,
      ...(input.thinking && input.reasoningEffort ? { requestedReasoningEffort: input.reasoningEffort } : {}),
      ...(typeof payload.usage?.prompt_tokens === "number" ? { promptTokens: payload.usage.prompt_tokens } : {}),
      ...(typeof payload.usage?.completion_tokens === "number" ? { completionTokens: payload.usage.completion_tokens } : {})
    } };
  }

  private async requestWithTransientRetry(input: StructuredGenerationRequest): Promise<Response> {
    const maximumAttempts = 3;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        // Countable per-attempt evidence for the bounded acceptance run. No
        // prompt, output, or credential is logged.
        console.info(`llm_model_request stage=${input.stage} attempt=${attempt} model=${this.config.llmModel}`);
        response = await this.request(`${this.config.llmBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.llmApiKey}`,
            "Content-Type": "application/json",
            ...llmRequestHeaders(this.sessionKey)
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.llmModel,
            thinking: { type: input.thinking ? "enabled" : "disabled" },
            ...(input.thinking && input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
            messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
            response_format: { type: "json_object" }, max_tokens: input.maxTokens,
            temperature: input.temperature, stream: false
          })
        });
      } catch (error) {
        if (controller.signal.aborted) throw new Error(`LLM request timed out: provider=${this.config.llmProvider}, model=${this.config.llmModel}`);
        void error;
        if (attempt === maximumAttempts) throw new Error(`LLM request failed: provider=${this.config.llmProvider}, model=${this.config.llmModel}, network error`);
        await this.waitBeforeRetry(attempt);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      if (attempt === maximumAttempts) return response;
      await this.waitBeforeRetry(attempt);
    }
    throw new Error(`LLM request failed: provider=${this.config.llmProvider}, model=${this.config.llmModel}, network error`);
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
  }
}

export function createJsonGenerationClient(env: LlmEnvironment = readLlmEnvironment()) {
  return new OpenAICompatibleJsonGenerationClient(env);
}
