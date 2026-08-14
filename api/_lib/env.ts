export type ServerEnvironment = {
  supabaseUrl: string;
  supabaseSecretKey: string;
  supabasePublishableKey: string;
};

export type EmbeddingEnvironment = {
  embeddingProvider: "dmxapi";
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: "text-embedding-3-small";
  embeddingDimensions: number;
};

export type LlmEnvironment = {
  llmProvider: "deepseek";
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
};

const EMBEDDING_PROVIDER = "dmxapi";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;

function required(name: string, value: string | undefined) {
  if (!value?.trim()) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function exact<const T extends string>(name: string, value: string | undefined, expected: T): T {
  const configured = required(name, value);
  if (configured !== expected) throw new Error(`${name} must be ${expected}`);
  return expected;
}

function embeddingDimensions(value: string | undefined): number {
  const configured = required("EMBEDDING_DIMENSIONS", value);
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("EMBEDDING_DIMENSIONS must be a positive integer");
  }
  if (parsed !== EMBEDDING_DIMENSIONS) {
    throw new Error(`EMBEDDING_DIMENSIONS must be ${EMBEDDING_DIMENSIONS} for the current embedding schema`);
  }
  return parsed;
}

function serverBaseUrl(name: string, value: string | undefined): string {
  const configured = required(name, value).trim();
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain a query string or fragment`);
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function readServerEnvironment(env: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return {
    supabaseUrl: required("SUPABASE_URL", env.SUPABASE_URL),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY", env.SUPABASE_SECRET_KEY),
    supabasePublishableKey: required("VITE_SUPABASE_PUBLISHABLE_KEY", env.VITE_SUPABASE_PUBLISHABLE_KEY)
  };
}

export function readEmbeddingEnvironment(env: NodeJS.ProcessEnv = process.env): EmbeddingEnvironment {
  return {
    embeddingProvider: exact("EMBEDDING_PROVIDER", env.EMBEDDING_PROVIDER, EMBEDDING_PROVIDER),
    embeddingBaseUrl: serverBaseUrl("EMBEDDING_BASE_URL", env.EMBEDDING_BASE_URL),
    embeddingApiKey: required("EMBEDDING_API_KEY", env.EMBEDDING_API_KEY),
    embeddingModel: exact("EMBEDDING_MODEL", env.EMBEDDING_MODEL, EMBEDDING_MODEL),
    embeddingDimensions: embeddingDimensions(env.EMBEDDING_DIMENSIONS)
  };
}

export function readLlmEnvironment(env: NodeJS.ProcessEnv = process.env): LlmEnvironment {
  return {
    llmProvider: exact("LLM_PROVIDER", env.LLM_PROVIDER, "deepseek"),
    llmBaseUrl: serverBaseUrl("LLM_BASE_URL", env.LLM_BASE_URL),
    llmApiKey: required("LLM_API_KEY", env.LLM_API_KEY),
    llmModel: required("LLM_MODEL", env.LLM_MODEL)
  };
}
